export interface Recommendation {
  summary: string;
  reasons: string[];
  impact: string;
  recommendations: string[];
}

interface PortAdvice {
  name: string;
  impact: string;
  recommendations: string[];
}

const PORT_ADVICE: Record<number, PortAdvice> = {
  22: {
    name: 'SSH',
    impact: 'SSH exposed to the internet enables brute-force credential attacks and unauthorized remote access',
    recommendations: [
      'Restrict SSH (22) to specific trusted IP ranges via firewall',
      'Disable password authentication and use SSH key pairs only',
      'Consider relocating SSH to a non-standard port to reduce automated scanning',
      'Enable fail2ban or similar brute-force protection',
    ],
  },
  3389: {
    name: 'RDP',
    impact: 'RDP exposed directly to the internet is the primary ransomware and lateral movement entry point',
    recommendations: [
      'Place RDP (3389) behind a VPN — never expose it directly to the internet',
      'Enable Network Level Authentication (NLA) on all RDP endpoints',
      'Enforce MFA for all RDP sessions',
      'Disable RDP entirely if remote desktop access is not required',
    ],
  },
  8080: {
    name: 'HTTP-ALT',
    impact: 'Alternative HTTP port may expose admin panels, internal APIs, or staging environments',
    recommendations: [
      'Verify what service is running on port 8080 and whether it is intentionally public',
      'Restrict access with firewall rules if this is an admin or internal service',
      'Use a reverse proxy and close direct access to application ports',
    ],
  },
  8443: {
    name: 'HTTPS-ALT',
    impact: 'Alternative HTTPS port may expose unintended or misconfigured services',
    recommendations: [
      'Verify what service is running on port 8443',
      'Restrict access via firewall if this port is not required to be public',
    ],
  },
  3000: {
    name: 'DEV-SERVER',
    impact: 'Port 3000 typically hosts development servers that are not hardened for production',
    recommendations: [
      'Close port 3000 — development servers should not be internet-facing',
      'Use a production-grade reverse proxy (nginx, Caddy) instead of exposing the dev server',
      'Restrict access to internal networks only via firewall',
    ],
  },
  5555: {
    name: 'DEV-SERVER-ALT',
    impact: 'Port 5555 may expose a development server or debugging interface',
    recommendations: [
      'Close port 5555 if it is a development or test server',
      'Restrict access to trusted IP ranges only',
    ],
  },
};

export function forPortExposed(riskyPorts: number[]): Recommendation {
  const portImpacts = riskyPorts.map((p) => PORT_ADVICE[p]?.impact ?? `Port ${p} is exposed`);
  const portRecs = riskyPorts.flatMap((p) => PORT_ADVICE[p]?.recommendations ?? [`Restrict access to port ${p} via firewall`]);
  return {
    summary: `${riskyPorts.length} risky port(s) exposed to the internet`,
    reasons: riskyPorts.map((p) => `Port ${p}${PORT_ADVICE[p] ? ` (${PORT_ADVICE[p].name})` : ''} is open and internet-accessible`),
    impact: portImpacts.join('. '),
    recommendations: [...new Set(portRecs)],
  };
}

export function forPortChange(newlyOpened: number[], newlyClosed: number[]): Recommendation {
  const recs = newlyOpened.flatMap((p) => PORT_ADVICE[p]?.recommendations ?? [`Investigate why port ${p} was opened and restrict if not needed`]);
  return {
    summary: `Port state changed: ${newlyOpened.length} opened, ${newlyClosed.length} closed`,
    reasons: [
      ...(newlyOpened.length > 0 ? [`Newly opened ports: ${newlyOpened.join(', ')}`] : []),
      ...(newlyClosed.length > 0 ? [`Closed ports: ${newlyClosed.join(', ')}`] : []),
    ],
    impact: newlyOpened.length > 0
      ? 'Newly opened ports may indicate unauthorized service exposure or misconfiguration'
      : 'Port closure may indicate a service going offline',
    recommendations: recs.length > 0 ? [...new Set(recs)] : ['Review the firewall rules and confirm the port change was intentional'],
  };
}

export function forHttpHealth(statusCode: number | null): Recommendation {
  if (statusCode === null) {
    return {
      summary: 'Asset is completely unreachable over HTTP/HTTPS',
      reasons: ['HTTP request timed out or the host refused the connection'],
      impact: 'The service appears to be down; users cannot access it',
      recommendations: [
        'Verify the server is running and listening on the expected port',
        'Check firewall rules to ensure HTTP/HTTPS traffic is allowed',
        'Review application logs for crash or resource exhaustion',
      ],
    };
  }
  return {
    summary: `HTTP server returned error status ${statusCode}`,
    reasons: [`HTTP ${statusCode} response indicates a server-side failure`],
    impact: 'Users may be receiving error pages instead of the expected service',
    recommendations: [
      'Check application logs for the root cause of the 5xx error',
      'Verify database connections and upstream dependencies are healthy',
      'Consider alerting and auto-restart policies for production services',
    ],
  };
}

export function forHttpChange(
  prevStatus: number | null,
  currStatus: number | null,
  latencySpike: boolean,
  prevLatency: number | null,
  currLatency: number | null,
): Recommendation {
  const reasons: string[] = [];
  const recommendations: string[] = [];

  if (prevStatus !== currStatus) {
    reasons.push(`HTTP status changed from ${prevStatus ?? 'unreachable'} to ${currStatus ?? 'unreachable'}`);
    if (currStatus === null) {
      recommendations.push('Investigate server availability — the service may have crashed');
    } else if (currStatus >= 500) {
      recommendations.push('Check server logs for the 5xx error root cause');
    } else {
      recommendations.push('Confirm the status change was intentional (e.g. maintenance page)');
    }
  }
  if (latencySpike) {
    reasons.push(`Response latency increased from ${prevLatency}ms to ${currLatency}ms`);
    recommendations.push('Investigate server resource utilization (CPU, memory, I/O)');
    recommendations.push('Check for database query performance issues or upstream API slowdowns');
  }

  return {
    summary: reasons[0] ?? 'HTTP behavior changed',
    reasons,
    impact: currStatus === null
      ? 'Service appears down — all users are affected'
      : currStatus >= 500
      ? 'Server errors may be intermittently or fully degrading the service'
      : 'Latency spike may indicate performance degradation',
    recommendations,
  };
}

export function forTlsCheck(error: string): Recommendation {
  return {
    summary: `TLS connection failed: ${error}`,
    reasons: [`TLS handshake error: ${error}`],
    impact: 'Users will see browser security warnings and may be unable to connect securely',
    recommendations: [
      'Verify the TLS certificate is installed correctly and matches the domain',
      'Ensure the certificate chain is complete (intermediate certificates included)',
      'Check that port 443 is open and the web server is configured for HTTPS',
    ],
  };
}

export function forTlsExpiry(daysLeft: number, validTo: string): Recommendation {
  if (daysLeft <= 0) {
    return {
      summary: 'TLS certificate has expired',
      reasons: ['Certificate validity period ended'],
      impact: 'All users are receiving browser security warnings; HTTPS is effectively broken',
      recommendations: [
        'Renew the TLS certificate immediately',
        "If using Let's Encrypt, run: certbot renew",
        'Investigate why automatic renewal failed',
      ],
    };
  }
  return {
    summary: `TLS certificate expires in ${daysLeft} day(s) (${validTo})`,
    reasons: [`Certificate will expire on ${validTo} — ${daysLeft} day(s) remaining`],
    impact: daysLeft <= 7
      ? 'Imminent expiry will cause browser security errors for all users within days'
      : 'Certificate expiry is approaching; service disruption will occur if not renewed',
    recommendations: [
      'Renew the TLS certificate before it expires',
      "If using Let's Encrypt, verify certbot timer: systemctl status certbot.timer",
      'Set up expiry monitoring and alerts to prevent future incidents',
    ],
  };
}

export function forDnsRecordChange(added: string[], removed: string[], changedTypes: string[]): Recommendation {
  return {
    summary: `DNS records changed for types: ${changedTypes.join(', ')}`,
    reasons: [
      ...(added.length > 0 ? [`New records added: ${added.join(', ')}`] : []),
      ...(removed.length > 0 ? [`Records removed: ${removed.join(', ')}`] : []),
    ],
    impact: 'DNS record changes may indicate infrastructure migration, misconfiguration, or unauthorized zone modification',
    recommendations: [
      'Verify the DNS change was planned and authorized',
      'Review DNS zone change history with your registrar or DNS provider',
      'If unexpected, check for unauthorized zone access or registrar account compromise',
    ],
  };
}

export function forDnsNsChange(prevNs: string[], currNs: string[]): Recommendation {
  return {
    summary: 'Nameserver (NS) kayıtları değişti',
    reasons: [
      `Önceki NS: ${prevNs.join(', ') || '(yok)'}`,
      `Güncel NS: ${currNs.join(', ') || '(yok)'}`,
    ],
    impact: 'Nameserver değişikliği, DNS yönlendirme otoritesinin değişmesi demektir. Planlı bir registrar veya hosting geçişi ise normaldir. Yetkisiz yapılmışsa ciddi risk oluşturabilir. Önce değişikliğin planlı olup olmadığı doğrulanmalıdır.',
    recommendations: [
      'Registrar panelinden bu NS değişikliğinin yetkili olup olmadığını doğrula',
      'Yetkisizse domain recovery sürecini başlat ve domaini registrar seviyesinde kilitle',
      'Registrar lock (transfer lock) özelliğini aktif et',
      'DNS ve registrar değişiklikleri için uyarı mekanizması kur',
    ],
  };
}

export function forDnsMxChange(prevMx: string[], currMx: string[]): Recommendation {
  return {
    summary: 'MX records changed — email routing may have been redirected',
    reasons: [
      `Previous MX: ${prevMx.join(', ') || '(none)'}`,
      `Current MX: ${currMx.join(', ') || '(none)'}`,
    ],
    impact: 'Unauthorized MX changes redirect inbound email to an attacker-controlled server, enabling credential theft and business email compromise',
    recommendations: [
      'Confirm the MX change was authorized by your email administrator',
      'Verify the new mail server is a legitimate provider',
      'If unexpected, revert MX records and investigate email provider account access',
      'Enable DMARC monitoring to detect email interception attempts',
    ],
  };
}

export function forDnsTxtChange(added: string[], removed: string[]): Recommendation {
  return {
    summary: 'TXT records changed — SPF, DMARC, or verification tokens may have been modified',
    reasons: [
      ...(added.length > 0 ? [`New TXT records: ${added.slice(0, 3).join(' | ')}${added.length > 3 ? ` (+${added.length - 3} more)` : ''}`] : []),
      ...(removed.length > 0 ? [`Removed TXT records: ${removed.slice(0, 3).join(' | ')}${removed.length > 3 ? ` (+${removed.length - 3} more)` : ''}`] : []),
    ],
    impact: 'TXT record changes may weaken email authentication (SPF/DMARC), remove domain ownership proofs, or indicate unauthorized zone access',
    recommendations: [
      'Review which TXT records changed and confirm they were authorized',
      'Ensure SPF, DMARC, and DKIM records are still correctly configured',
      'If unexpected, audit DNS zone access logs at your DNS provider',
    ],
  };
}

export function forSpfMissing(domain: string): Recommendation {
  return {
    summary: `No SPF record found for ${domain} — domain spoofing is possible`,
    reasons: ['No TXT record starting with "v=spf1" exists on the domain'],
    impact: 'Without SPF, anyone can send email claiming to be from this domain; spam and phishing attacks are easier to execute',
    recommendations: [
      'Add an SPF TXT record to your DNS zone, e.g.: v=spf1 include:_spf.yourmailprovider.com ~all',
      'Use "-all" (hard fail) rather than "~all" (soft fail) for stricter enforcement',
      'Validate SPF syntax at a tool like mxtoolbox.com/spf.aspx',
    ],
  };
}

export function forDmarcMissing(domain: string): Recommendation {
  return {
    summary: `No DMARC record found for ${domain} — email authentication is unenforced`,
    reasons: ['No TXT record starting with "v=DMARC1" exists at _dmarc.' + domain],
    impact: 'Without DMARC, spoofed emails from this domain reach inboxes; brand impersonation and phishing attacks go unreported',
    recommendations: [
      'Add a DMARC TXT record at _dmarc.' + domain + ', e.g.: v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain,
      'Start with p=none to collect reports, then graduate to p=quarantine and p=reject',
      'Configure an rua (reporting URI) to receive DMARC aggregate reports',
    ],
  };
}

export function forDmarcWeakPolicy(domain: string, policy: string): Recommendation {
  return {
    summary: `DMARC policy is "${policy}" for ${domain} — spoofed emails are not blocked`,
    reasons: [`DMARC record exists but p=${policy} only monitors; it does not quarantine or reject failing emails`],
    impact: 'p=none provides visibility but zero protection; spoofed emails still reach recipients',
    recommendations: [
      'Upgrade DMARC policy to p=quarantine to send failing emails to spam',
      'After monitoring quarantine reports, advance to p=reject for full enforcement',
      'Ensure SPF and DKIM are aligned before tightening the policy',
    ],
  };
}

export function forCaaMissing(domain: string): Recommendation {
  return {
    summary: `No CAA record found for ${domain} — any CA can issue TLS certificates`,
    reasons: ['No CAA DNS record restricts which Certificate Authorities may issue certificates for this domain'],
    impact: 'Without CAA, a compromised or rogue CA can issue a valid certificate for this domain, enabling MITM attacks',
    recommendations: [
      'Add CAA records to restrict issuance to your CA(s), e.g.: 0 issue "letsencrypt.org"',
      'Add a CAA record for wildcard issuance if needed: 0 issuewild "letsencrypt.org"',
      'Include an iodef address for misissuance notifications: 0 iodef "mailto:security@' + domain + '"',
    ],
  };
}

export function forRobotsSensitivePath(domain: string, sensitivePaths: string[], highSeverityPaths: string[]): Recommendation {
  const hasHighRisk = highSeverityPaths.length > 0;
  return {
    summary: `robots.txt exposes ${sensitivePaths.length} sensitive path(s) for ${domain}`,
    reasons: [
      `Disallow rules reveal sensitive paths: ${sensitivePaths.slice(0, 5).join(', ')}${sensitivePaths.length > 5 ? ` (+${sensitivePaths.length - 5} more)` : ''}`,
      ...(hasHighRisk ? [`High-risk paths found: ${highSeverityPaths.join(', ')}`] : []),
    ],
    impact: hasHighRisk
      ? 'High-risk paths (backup, config, .env) suggest sensitive files or credentials may be accessible — robots.txt acts as a roadmap for attackers'
      : 'Sensitive admin or internal paths revealed in robots.txt can assist attackers in reconnaissance and targeting',
    recommendations: [
      'Verify these paths are protected by authentication and authorization at the application layer',
      'robots.txt does not provide security — it only instructs well-behaved crawlers',
      hasHighRisk ? 'Immediately check if backup files, config files, or .env files are accessible without authentication' : 'Review whether admin and private paths are unnecessarily exposed',
      'Consider whether all Disallow entries need to be public — only use robots.txt to guide SEO crawlers, not to hide sensitive content',
    ],
  };
}

export function forRobotsChange(domain: string, addedRules: string[], removedRules: string[]): Recommendation {
  return {
    summary: `robots.txt content changed for ${domain}`,
    reasons: [
      ...(addedRules.length > 0 ? [`New Disallow rules added: ${addedRules.slice(0, 3).join(', ')}${addedRules.length > 3 ? ` (+${addedRules.length - 3} more)` : ''}`] : []),
      ...(removedRules.length > 0 ? [`Disallow rules removed: ${removedRules.slice(0, 3).join(', ')}${removedRules.length > 3 ? ` (+${removedRules.length - 3} more)` : ''}`] : []),
    ],
    impact: 'robots.txt change may reflect new application paths, removed content, or deployment changes; added rules may expose new sensitive areas',
    recommendations: [
      'Verify this change was part of a planned deployment or content update',
      'Review any newly added Disallow paths for sensitive areas that should not be public knowledge',
      'If unexpected, check your deployment pipeline and web server configuration',
    ],
  };
}

export function forAsnChange(
  assetValue: string,
  previousAsn: string | null,
  currentAsn: string | null,
  previousOrg: string | null,
  currentOrg: string | null,
): Recommendation {
  return {
    summary: `ASN changed for ${assetValue}: ${previousAsn ?? '(none)'} → ${currentAsn ?? '(none)'}`,
    reasons: [
      `ASN changed from ${previousAsn ?? 'unknown'} to ${currentAsn ?? 'unknown'}`,
      ...(previousOrg !== currentOrg ? [`Organization changed from "${previousOrg ?? 'unknown'}" to "${currentOrg ?? 'unknown'}")`] : []),
    ],
    impact: 'ASN change indicates a hosting provider, CDN, or routing change; may be legitimate migration or unauthorized traffic hijacking',
    recommendations: [
      'Verify the infrastructure change was authorized (hosting migration, CDN switch)',
      'Confirm the new ASN belongs to your expected provider',
      'If unexpected, check for BGP hijacking or DNS misconfiguration',
      'Review firewall and security group rules for the new IP range',
    ],
  };
}

export function forGeoIpChange(assetValue: string, changedFields: string[]): Recommendation {
  const hasCountry = changedFields.includes('countryCode') || changedFields.includes('country');
  const hasOrg = changedFields.includes('isp') || changedFields.includes('organization');
  return {
    summary: `GeoIP/ISP information changed for ${assetValue}: ${changedFields.join(', ')}`,
    reasons: changedFields.map((f) => `Field changed: ${f}`),
    impact: hasCountry && hasOrg
      ? 'Country and organization changed simultaneously — possible unauthorized infrastructure migration or traffic hijacking'
      : hasCountry
      ? 'Geographic location change may indicate CDN re-routing, hosting migration, or BGP anomaly'
      : 'ISP or organization change indicates hosting provider change; verify it was intentional',
    recommendations: [
      'Confirm the infrastructure change was planned (CDN migration, new hosting provider)',
      ...(hasCountry ? ['Verify data residency and compliance requirements are still met for the new geographic location'] : []),
      'Review access logs and security policies for the new infrastructure',
      'Update firewall and allowlist rules if IP ranges changed',
    ],
  };
}

export function forWhoisExpiring(domain: string, daysLeft: number, expiresDate: string): Recommendation {
  const expired = daysLeft <= 0;
  return {
    summary: expired
      ? `Domain ${domain} registration has expired`
      : `Domain ${domain} expires in ${daysLeft} day(s) (${expiresDate})`,
    reasons: [
      expired
        ? `Registration expired on ${expiresDate}`
        : `Domain registration expires on ${expiresDate} — ${daysLeft} day(s) remaining`,
    ],
    impact: expired
      ? 'Expired domain may be suspended, parked by registrar, or already acquired by a third party'
      : daysLeft <= 7
      ? 'Imminent expiry will cause DNS failure and complete service outage; domain may become available for re-registration'
      : 'Domain expiry approaching; failure to renew will result in service outage and possible domain loss',
    recommendations: [
      'Log in to your registrar and renew the domain immediately',
      'Enable auto-renew and verify payment method is current',
      'Set renewal reminders at 60, 30, and 7 days before expiry',
      'Consider registering for multiple years to avoid recurring risk',
    ],
  };
}

export function forWhoisChange(domain: string, changedFields: string[]): Recommendation {
  const hasRegistrar = changedFields.includes('registrar');
  const hasNs = changedFields.includes('nameServers');
  return {
    summary: `WHOIS record changed for ${domain}: ${changedFields.join(', ')}`,
    reasons: changedFields.map((f) => `Field changed: ${f}`),
    impact: hasRegistrar
      ? 'Registrar change may indicate unauthorized domain transfer or account compromise'
      : hasNs
      ? 'Nameserver change transfers DNS control; may indicate domain hijacking or registrar compromise'
      : 'Domain status or expiry changes may reflect administrative actions or registrar policy changes',
    recommendations: [
      'Verify the change was authorized by logging in to your registrar account',
      ...(hasRegistrar ? ['If registrar was changed without authorization, contact ICANN dispute resolution immediately'] : []),
      ...(hasNs ? ['Confirm new nameservers point to your DNS provider; unauthorized changes mean DNS is under attacker control'] : []),
      'Enable registrar lock (transfer lock) and two-factor authentication on your registrar account',
      'Set up registrar-level change notifications',
    ],
  };
}

export function forBreachExposureDetected(
  domain: string,
  breachCount: number,
  exposedEmailsCount: number | null,
  sensitiveDataTypes: string[],
): Recommendation {
  const hasPassword = sensitiveDataTypes.includes('password') || sensitiveDataTypes.includes('plaintext_password');
  const hasHash = sensitiveDataTypes.includes('password_hash');
  const emailNote = exposedEmailsCount !== null ? ` (~${exposedEmailsCount.toLocaleString()} records)` : '';
  return {
    summary: `${domain} is associated with ${breachCount} known data breach(es)${emailNote}`,
    reasons: [
      `${breachCount} breach source(s) detected for domain ${domain}`,
      ...(sensitiveDataTypes.length > 0 ? [`Exposed data types: ${sensitiveDataTypes.slice(0, 5).join(', ')}`] : []),
    ],
    impact: hasPassword
      ? 'Plaintext passwords have been exposed. Affected accounts are at immediate risk of credential stuffing and account takeover attacks.'
      : hasHash
      ? 'Password hashes have been exposed. Cracked hashes enable credential stuffing; users reusing passwords on other services are at risk.'
      : 'Account data has been exposed in known breach databases. Affected users may be targeted by phishing or credential attacks.',
    recommendations: [
      'Force password resets for all affected accounts and invalidate existing sessions',
      'Enforce multi-factor authentication (MFA) across all accounts',
      'Notify affected users according to your breach notification policy and applicable regulations (GDPR, CCPA, etc.)',
      'Audit how the breach occurred — review access logs, third-party integrations, and data storage practices',
      'Scan for credential reuse across related services and enforce unique password requirements',
    ],
  };
}

export function forMaliciousReputationDetected(
  assetValue: string,
  assetType: 'DOMAIN' | 'IP',
  providers: string[],
  categories: string[],
): Recommendation {
  const isIP = assetType === 'IP';
  const categoryList = categories.length > 0 ? categories.slice(0, 5).join(', ') : 'malicious activity';
  return {
    summary: `${assetType} ${assetValue} flagged in threat intelligence: ${providers.join(', ')}`,
    reasons: [
      `Detected by: ${providers.join(', ')}`,
      ...(categories.length > 0 ? [`Associated categories: ${categoryList}`] : []),
    ],
    impact: isIP
      ? 'IP has abuse reports or is listed in threat intelligence databases, indicating possible compromised hosting, botnet activity, or attack traffic originating from this address.'
      : 'Domain is associated with malware, phishing, C2, or botnet infrastructure. This can damage user trust, trigger browser/AV warnings, and result in hosting or email provider sanctions.',
    recommendations: [
      `Verify the ${assetType} is still under your control and has not been compromised`,
      isIP
        ? 'Review server logs for suspicious outbound connections, unauthorized processes, or indicators of compromise'
        : 'Check all web content and subdomains for unauthorized files, injected scripts, or redirects',
      isIP
        ? 'If using shared hosting or CDN, contact your provider — the IP may be shared and the listing may affect others on the same host'
        : 'If malicious content is confirmed active, request takedown from your hosting provider and submit abuse reports to the relevant registries',
      'Consider deploying an intrusion detection system and reviewing firewall and access control rules',
      'If the listing is in error, initiate a reputation dispute with the flagging provider',
    ],
  };
}

export function forPhishingDetected(domain: string, matchedUrls: string[]): Recommendation {
  return {
    summary: `Domain ${domain} has been identified in phishing lists`,
    reasons: [
      `${matchedUrls.length} phishing URL(s) found matching domain or subdomain of ${domain}`,
      ...matchedUrls.slice(0, 3).map((u) => `Phishing URL: ${u}`),
    ],
    impact: 'Domain or its subdomain is being used in phishing attacks. This can damage user trust, lead to credential theft, and result in regulatory or legal consequences.',
    recommendations: [
      'Immediately investigate all subdomains and web server files for unauthorized content',
      'Check DNS records, hosting content, and subdomain ownership for signs of compromise',
      'If a phishing page is active, request takedown from your hosting provider and file an abuse report',
      'Review domain management panel security, MFA settings, and user account access',
      'Check for open redirects or subdomain takeover vectors that could be exploited for phishing',
    ],
  };
}

export function forOtxPulseDetected(
  assetValue: string,
  pulseCount: number,
  pulseNames: string[],
  tags: string[],
): Recommendation {
  const tagList = tags.slice(0, 5).join(', ') || '-';
  return {
    summary: `${assetValue} OTX üzerinde ${pulseCount} tehdit pulse'ıyla ilişkilendirilmiş görünüyor`,
    reasons: [
      `${pulseCount} adet OTX pulse bu asset ile ilişkilendirilmiş`,
      ...(pulseNames.length > 0 ? [`İlgili pulse'lar: ${pulseNames.slice(0, 3).join(', ')}`] : []),
      ...(tags.length > 0 ? [`Etiketler: ${tagList}`] : []),
    ],
    impact: 'Bu bulgu, asset\'in kesin olarak zararlı olduğunu kanıtlamaz. Büyük/popüler domainlerde marka taklidi, analiz içi referans veya tehdit raporları nedeniyle OTX ilişkisi görülebilir. Yine de DNS, içerik, yönlendirme ve hosting kayıtları ayrıca incelenmelidir.',
    recommendations: [
      'DNS kayıtları, web içerikleri ve yönlendirmeleri kontrol edin — beklenmedik değişiklik var mı?',
      'Web sunucu loglarını ve son deploy geçmişini inceleyin',
      'Hosting/IP değişikliklerini ve CDN yapılandırmasını doğrulayın',
      'PhishTank, VirusTotal veya Google Safe Browsing gibi ek kaynaklarla çapraz doğrulama yapın',
      'OTX pulse bağlamını inceleyerek hangi kampanya veya raporla ilişkilendirildiğini anlayın',
      'İçerik temizse ve değişiklik yetkili ise OTX\'te itiraz (dispute) başlatabilirsiniz',
    ],
  };
}

export function forOtxMalwareActivityDetected(
  assetValue: string,
  malwareCount: number,
  tags: string[],
): Recommendation {
  const tagList = tags.slice(0, 5).join(', ') || '-';
  return {
    summary: `${assetValue} OTX verilerinde ${malwareCount} malware referansıyla ilişkilendirilmiş görünüyor`,
    reasons: [
      `${malwareCount} adet malware gözlemi bu asset ile OTX'te ilişkilendirilmiş`,
      ...(tags.length > 0 ? [`İlişkili etiketler: ${tagList}`] : []),
    ],
    impact: 'Bu bulgu doğrudan domainin ele geçirildiğini kanıtlamaz. Bazı durumlarda marka taklidi, analiz içi referans veya saldırı kampanyası bağlamı nedeniyle malware ilişkisi oluşabilir. Yine de web içeriği, yönlendirmeler, DNS kayıtları ve hosting değişiklikleri incelenmelidir.',
    recommendations: [
      'Web içeriğini, sunucu dosyalarını ve yönlendirmeleri yetkisiz değişiklik için kontrol edin',
      'DNS kayıtlarında beklenmedik değişiklik olup olmadığını doğrulayın',
      'Hosting değişikliklerini ve son deploy geçmişini inceleyin',
      'PhishTank, VirusTotal veya Google Safe Browsing gibi ek kaynaklarla çapraz doğrulama yapın',
      'OTX\'teki malware örneklerini inceleyerek ilişki bağlamını (kampanya/analiz/marka taklidi) anlayın',
      'İçerik temizse ve değişiklik yetkili ise OTX\'te itiraz (dispute) başlatabilirsiniz',
    ],
  };
}

export function forTlsChange(changes: Record<string, boolean>): Recommendation {
  const changedFields = Object.entries(changes)
    .filter(([k, v]) => k.endsWith('Changed') && v)
    .map(([k]) => k.replace('Changed', ''));
  return {
    summary: `TLS certificate changed: ${changedFields.join(', ')}`,
    reasons: changedFields.map((f) => `TLS ${f} has changed since the last scan`),
    impact: 'Unexpected certificate changes may indicate certificate re-issuance, misconfiguration, or a MITM interception',
    recommendations: [
      'Verify this certificate change was intentional (planned renewal or migration)',
      'If not expected, investigate for potential certificate hijacking or misconfiguration',
      'Review certificate transparency logs for unauthorized certificates',
    ],
  };
}

export function forSqliSuspected(args: {
  path: string;
  param: string;
  signals: readonly string[];
  confirmed: boolean;
}): Recommendation {
  const has = (s: string): boolean => args.signals.includes(s);
  const reasons: string[] = [];

  if (has('SQL_ERROR_PATTERN')) reasons.push('Yanıtta SQL hata paterni görüldü.');
  if (has('STATUS_CODE_5XX')) reasons.push('Payload sonrası sunucu 5xx hata döndürdü.');
  if (has('STATUS_CODE_CHANGED')) reasons.push('Baseline ve payload HTTP durum kodları farklılaştı.');
  if (has('BODY_LENGTH_DELTA')) reasons.push('Baseline ve payload yanıt boyutları anlamlı farklılaştı.');
  if (has('BOOLEAN_TRUE_FALSE_DELTA')) reasons.push('Boolean true/false payloadları farklı yanıt üretti.');
  if (args.confirmed) reasons.push('Aynı payload ikinci denemede de benzer sinyal üretti.');

  return {
    summary: `${args.path} adresindeki ${args.param} parametresinde SQL Injection şüphesi gözlendi.`,
    reasons,
    impact:
      'Bu bulgu veri sızıntısı, yetkisiz erişim veya veritabanı hatalarının dışarı sızması riskini gösterebilir. ' +
      'Bu sonuç otomatik test bulgusudur ve manuel doğrulama önerilir.',
    recommendations: [
      'Prepared statement / parameterized query kullanın.',
      'Kullanıcı girdisini SQL string içine doğrudan eklemeyin.',
      'ORM kullanıyorsanız raw query yerine parametre binding kullanın.',
      'Üretim ortamında detaylı SQL hata mesajlarını göstermeyin.',
      'Bu endpoint\'i manuel güvenlik testiyle doğrulayın.',
    ],
  };
}
