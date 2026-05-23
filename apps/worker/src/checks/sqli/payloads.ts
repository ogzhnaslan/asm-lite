// SQL Injection probe payload catalog — MVP.
//
// Tüm payload'lar SADECE şüphe sinyali üretmeyi hedefler. Veri çekmez,
// tablo/kolon enumeration yapmaz, login bypass denemez, destructive değildir.
// SLEEP/WAITFOR ve UNION SELECT MVP'de yasaklıdır.
//
// İleride yeni payload eklenirse: defansif kalın, yan etkisiz olun.

export type SqliPayloadCategory =
  | 'syntax_error'    // Quote/parenthesis ile SQL parser hatası tetikleme
  | 'boolean_true'    // TRUE boolean — response delta sinyali
  | 'boolean_false'   // FALSE boolean — response delta sinyali (TRUE ile karşılaştırılır)
  | 'comment_break';  // SQL comment ile sorgu sonlandırma — syntax hatası tetikler

export interface SqliPayload {
  id: string;
  category: SqliPayloadCategory;
  value: string;
  description: string;
}

export const SQLI_PAYLOADS: readonly SqliPayload[] = [
  { id: 'sql_quote',        category: 'syntax_error',  value: "'",                  description: 'Tek tırnak — SQL syntax error tetikleyebilir' },
  { id: 'sql_dquote',       category: 'syntax_error',  value: '"',                  description: 'Çift tırnak — SQL syntax error tetikleyebilir' },
  { id: 'sql_backslash',    category: 'syntax_error',  value: "\\'",                description: 'Escape edilmiş tırnak — bazı engine\'lerde syntax error' },
  { id: 'sql_paren_quote',  category: 'syntax_error',  value: "')",                 description: 'Parantez kapatma + tek tırnak' },
  { id: 'sql_bool_true',    category: 'boolean_true',  value: "' OR '1'='1' -- ",   description: 'Boolean TRUE — response delta sinyali için' },
  { id: 'sql_bool_false',   category: 'boolean_false', value: "' AND '1'='2' -- ",  description: 'Boolean FALSE — TRUE ile karşılaştırma için' },
  { id: 'sql_comment_dd',   category: 'comment_break', value: "'-- ",               description: 'String sonlandırma + double-dash comment' },
  { id: 'sql_comment_hash', category: 'comment_break', value: "'# ",                description: 'MySQL hash comment' },
] as const;
