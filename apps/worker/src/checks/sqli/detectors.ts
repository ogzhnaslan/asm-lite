// Pure detector functions for the SQLi check. Saf, side-effect'siz; orchestrator
// (sqli.check.ts) bunları çağırır ve sinyalleri toplar. Yanlış pozitifi sınırlamak
// için her detector defensif eşiklere sahiptir.

export type SqliSignal =
  | 'SQL_ERROR_PATTERN'
  | 'STATUS_CODE_CHANGED'
  | 'STATUS_CODE_5XX'
  | 'BODY_LENGTH_DELTA'
  | 'BOOLEAN_TRUE_FALSE_DELTA';

export type SqliRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ErrorPatternMatch {
  engine: string;
  snippet: string;
}

// SQL engine signature regex'leri. Order önemlidir — daha spesifik desenler önce.
// MariaDB pattern'leri MySQL'den önce gelir (MariaDB body'leri MySQL ile de eşleşebileceği
// için engine adı doğru raporlansın diye). Universal "You have an error in your SQL
// syntax" pattern'i (engine adı yok) en sona yakın yerleştirilir — MySQL/MariaDB
// stacks'larında ortak çıkar ama spesifik isim yoksa fallback olarak yakalanır.
// Yeni engine eklerken: spesifik → genel sıra korunmalı.
export const SQL_ERROR_PATTERNS: readonly { engine: string; regex: RegExp }[] = [
  // MariaDB-spesifik (önce gelir ki MariaDB body'leri 'mariadb' engine olarak raporlansın)
  { engine: 'mariadb',    regex: /SQL syntax.*MariaDB/i },
  { engine: 'mariadb',    regex: /MariaDB server version/i },
  // MySQL-spesifik
  { engine: 'mysql',      regex: /SQL syntax.*MySQL/i },
  { engine: 'mysql',      regex: /mysqli_sql_exception/i },
  { engine: 'mysql',      regex: /Warning.*\Wmysqli?_/i },
  { engine: 'mysql',      regex: /MySQLSyntaxErrorException/i },
  // Universal MySQL/MariaDB syntax error prefix — engine adı body'de yoksa fallback
  { engine: 'mysql',      regex: /You have an error in your SQL syntax/i },
  // Diğer engine'ler
  { engine: 'postgresql', regex: /valid PostgreSQL result/i },
  { engine: 'postgresql', regex: /PG::SyntaxError/i },
  { engine: 'mssql',      regex: /Microsoft.*ODBC.*SQL Server/i },
  { engine: 'mssql',      regex: /Unclosed quotation mark/i },
  { engine: 'oracle',     regex: /Oracle.*ORA-\d+/i },
  { engine: 'sqlite',     regex: /SQLite.*error/i },
  { engine: 'generic',    regex: /supplied argument is not a valid/i },
  { engine: 'generic',    regex: /SQL syntax.*error/i },
];

// Body delta için defansif eşik: hem 200 byte minimum mutlak fark, hem de %5 oran.
// Bu, küçük dinamik içerik değişimlerinin (timestamp, csrf token vb.) sinyal
// üretmesini engeller.
export const BODY_LENGTH_MIN_DIFF_BYTES = 200;
export const BODY_LENGTH_MIN_RATIO = 0.05;

const ERROR_SNIPPET_PRE = 30;
const ERROR_SNIPPET_POST = 50;
const ERROR_SNIPPET_MAX = 200;

export function matchSqlError(body: string | null | undefined): ErrorPatternMatch | null {
  if (!body) return null;
  for (const p of SQL_ERROR_PATTERNS) {
    const m = p.regex.exec(body);
    if (m) {
      const matchIndex = m.index ?? 0;
      const matchLength = m[0]?.length ?? 0;
      const start = Math.max(0, matchIndex - ERROR_SNIPPET_PRE);
      const end = Math.min(body.length, matchIndex + matchLength + ERROR_SNIPPET_POST);
      const raw = body.slice(start, end);
      const snippet = raw.length > ERROR_SNIPPET_MAX ? raw.slice(0, ERROR_SNIPPET_MAX) : raw;
      return { engine: p.engine, snippet };
    }
  }
  return null;
}

export function detectStatusChanged(baselineStatus: number | null, probeStatus: number | null): boolean {
  if (baselineStatus === null || probeStatus === null) return false;
  return baselineStatus !== probeStatus;
}

export function detectStatus5xx(probeStatus: number | null): boolean {
  if (probeStatus === null) return false;
  return probeStatus >= 500 && probeStatus < 600;
}

export function detectBodyLengthDelta(
  baselineLength: number | null,
  probeLength: number | null,
): boolean {
  if (baselineLength === null || probeLength === null) return false;
  const diff = Math.abs(baselineLength - probeLength);
  if (diff < BODY_LENGTH_MIN_DIFF_BYTES) return false;
  const max = Math.max(baselineLength, probeLength);
  if (max === 0) return false;
  return diff / max >= BODY_LENGTH_MIN_RATIO;
}

export function computeRisk(args: {
  signals: ReadonlySet<SqliSignal>;
  confirmed: boolean;
}): { risk: SqliRisk | null; aiScore: number | null } {
  const { signals, confirmed } = args;
  if (signals.size === 0) return { risk: null, aiScore: null };

  const has = (s: SqliSignal): boolean => signals.has(s);

  // CRITICAL: SQL_ERROR_PATTERN + (5xx ya da body delta) ve confirmation başarılı
  if (has('SQL_ERROR_PATTERN') && (has('STATUS_CODE_5XX') || has('BODY_LENGTH_DELTA')) && confirmed) {
    return { risk: 'CRITICAL', aiScore: 95 };
  }

  // HIGH: SQL_ERROR_PATTERN tek başına yeterli (engine signature güçlü sinyal)
  if (has('SQL_ERROR_PATTERN')) {
    return { risk: 'HIGH', aiScore: 85 };
  }

  // MEDIUM: Boolean TRUE/FALSE response farkı veya status+body kombinasyonu
  if (has('BOOLEAN_TRUE_FALSE_DELTA') || (has('STATUS_CODE_CHANGED') && has('BODY_LENGTH_DELTA'))) {
    return { risk: 'MEDIUM', aiScore: 65 };
  }

  // LOW: tek zayıf sinyal (sadece status veya sadece body delta)
  return { risk: 'LOW', aiScore: 35 };
}
