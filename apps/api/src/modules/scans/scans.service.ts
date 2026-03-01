import net from "node:net";
import tls from "node:tls";
import axios from "axios";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type HealthOk = { url: string; statusCode: number; latencyMs: number };
type HealthFail = { url: string; statusCode: null; latencyMs: null; error: string };
type HealthResult = HealthOk | HealthFail;

type TlsInfo = {
  host: string;
  validTo: string | null; // ISO string
  daysLeft: number | null;

  // ✅ Sertifika kimlik alanları (TLS_CHANGE için en sağlam sinyal)
  issuer: string | null;
  subject: string | null;
  serialNumber: string | null;
  fingerprint256: string | null;

  error?: string;
};

@Injectable()
export class ScansService {
  constructor(private readonly prisma: PrismaService) { }

  private parseHost(value: string): { hostOnly: string; explicitPort: number | null } {
    // "localhost:5555" gibi değerlerde net/tls host kısmı "localhost" olmalı
    const m = value.match(/^([^:]+):(\d+)$/);
    if (!m) return { hostOnly: value, explicitPort: null };
    return { hostOnly: m[1], explicitPort: Number(m[2]) };
  }

  // TLS sertifika bilgisini okur (bitiş tarihi + kimlik alanları)
  private async getTlsInfo(host: string): Promise<TlsInfo> {
    return await new Promise<TlsInfo>((resolve) => {
      const socket = tls.connect(
        {
          host,
          port: 443,
          servername: host, // SNI
          timeout: 5000,
          rejectUnauthorized: false, // sadece sertifika bilgisini okumak için
        },
        () => {
          try {
            const cert: any = socket.getPeerCertificate?.();

            const issuer = cert?.issuer ? JSON.stringify(cert.issuer) : null;
            const subject = cert?.subject ? JSON.stringify(cert.subject) : null;
            const serialNumber = cert?.serialNumber ? String(cert.serialNumber) : null;
            const fingerprint256 = cert?.fingerprint256 ? String(cert.fingerprint256) : null;

            const validToStr = cert?.valid_to ? String(cert.valid_to) : null;

            if (!validToStr) {
              socket.end();
              return resolve({
                host,
                validTo: null,
                daysLeft: null,
                issuer,
                subject,
                serialNumber,
                fingerprint256,
                error: "No certificate valid_to",
              });
            }

            const validTo = new Date(validToStr);
            const msLeft = validTo.getTime() - Date.now();
            const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));

            socket.end();
            return resolve({
              host,
              validTo: validTo.toISOString(),
              daysLeft,
              issuer,
              subject,
              serialNumber,
              fingerprint256,
            });
          } catch (e: any) {
            socket.end();
            return resolve({
              host,
              validTo: null,
              daysLeft: null,
              issuer: null,
              subject: null,
              serialNumber: null,
              fingerprint256: null,
              error: e?.message ?? "TLS parse error",
            });
          }
        },
      );

      socket.on("error", (err) => {
        return resolve({
          host,
          validTo: null,
          daysLeft: null,
          issuer: null,
          subject: null,
          serialNumber: null,
          fingerprint256: null,
          error: err.message,
        });
      });

      socket.on("timeout", () => {
        socket.destroy();
        return resolve({
          host,
          validTo: null,
          daysLeft: null,
          issuer: null,
          subject: null,
          serialNumber: null,
          fingerprint256: null,
          error: "TLS timeout",
        });
      });
    });
  }

  // Scan history (asset bazlı run listesi)
  async history(assetId: string) {
    if (!assetId) throw new BadRequestException("assetId is required");

    return this.prisma.scanRun.findMany({
      where: { assetId },
      orderBy: [{ startedAt: "desc" }],
      select: {
        id: true,
        assetId: true,
        startedAt: true,
        finishedAt: true,
        status: true,
      },
    });
  }

  async runNow(assetId: string) {
    if (!assetId) throw new BadRequestException("assetId is required");

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId },
      select: { id: true, status: true, type: true, value: true },
    });

    if (!asset) throw new NotFoundException("Asset not found");
    if (asset.status !== "VERIFIED") throw new ForbiddenException("Asset is not verified");

    const run = await this.prisma.scanRun.create({
      data: {
        assetId: asset.id,
        status: "RUNNING",
      },
      select: { id: true, startedAt: true, status: true },
    });

    try {
      const domain = asset.value;
      const { hostOnly, explicitPort } = this.parseHost(domain);

      // -------------------------
      // PORT CHECK (Whitelist)
      // -------------------------
      const PORT_WHITELIST = [80, 443, 22, 8080, 8443, 3000, 3389];

      const checkPort = (host: string, port: number, timeoutMs = 1200) =>
        new Promise<{ port: number; open: boolean; error?: string }>((resolve) => {
          const socket = new net.Socket();

          const done = (open: boolean, error?: string) => {
            socket.destroy();
            resolve({ port, open, ...(error ? { error } : {}) });
          };

          socket.setTimeout(timeoutMs);
          socket.once("connect", () => done(true));
          socket.once("timeout", () => done(false, "timeout"));
          socket.once("error", (err: any) => done(false, err?.code ?? err?.message ?? "error"));

          socket.connect(port, host);
        });

      const checkPorts = async (host: string, ports: number[]) => {
        const results = await Promise.all(ports.map((p) => checkPort(host, p)));
        const openPorts = results.filter((r) => r.open).map((r) => r.port);
        return { results, openPorts, ports };
      };

      const ports = await checkPorts(hostOnly, PORT_WHITELIST);

      // PORTS snapshot
      await this.prisma.scanCheckResult.create({
        data: {
          scanRunId: run.id,
          type: "PORTS",
          dataJson: ports as any,
        },
      });

      // -------------------------
      // PORTS CHANGE DETECTION (Diff)
      // -------------------------
      const prevPortsSnap = await this.prisma.scanCheckResult.findFirst({
        where: {
          type: "PORTS",
          scanRun: {
            assetId: asset.id,
            status: "DONE",
            id: { not: run.id },
          },
        },
        orderBy: { createdAt: "desc" },
        select: { dataJson: true },
      });

      if (prevPortsSnap) {
        const prevOpenPorts: number[] = Array.isArray((prevPortsSnap.dataJson as any)?.openPorts)
          ? (prevPortsSnap.dataJson as any).openPorts
          : [];

        const currOpenPorts: number[] = Array.isArray((ports as any)?.openPorts)
          ? (ports as any).openPorts
          : [];

        const newlyOpened = currOpenPorts.filter((p) => !prevOpenPorts.includes(p));
        const newlyClosed = prevOpenPorts.filter((p) => !currOpenPorts.includes(p));

        if (newlyOpened.length > 0 || newlyClosed.length > 0) {
          const criticalPorts = [22, 3389];
          const highPorts = [8080, 8443, 3000];

          const severity = newlyOpened.some((p) => criticalPorts.includes(p))
            ? "CRITICAL"
            : newlyOpened.some((p) => highPorts.includes(p))
              ? "HIGH"
              : "MEDIUM";

          const key = `PORT_CHANGE:${domain}`;
          const aiScore = severity === "CRITICAL" ? 95 : severity === "HIGH" ? 85 : 70;

          const aiWhyJson = {
            reasons: [
              newlyOpened.length > 0 ? `New ports opened: ${newlyOpened.join(", ")}` : "No new ports opened",
              newlyClosed.length > 0 ? `Ports closed: ${newlyClosed.join(", ")}` : "No ports closed",
            ],
            signals: { prevOpenPorts, currOpenPorts, newlyOpened, newlyClosed },
          };

          const existing = await this.prisma.finding.findFirst({
            where: { assetId: asset.id, key },
            select: { id: true },
          });

          const dataJson = { prevOpenPorts, currOpenPorts, newlyOpened, newlyClosed };

          if (existing) {
            await this.prisma.finding.update({
              where: { id: existing.id },
              data: {
                scanRunId: run.id,
                type: "PORT_CHANGE",
                severity: severity as any,
                dataJson: dataJson as any,
                aiScore,
                aiWhyJson,
                isNew: false,
                lastSeenAt: new Date(),
              },
            });
          } else {
            await this.prisma.finding.create({
              data: {
                assetId: asset.id,
                scanRunId: run.id,
                type: "PORT_CHANGE",
                key,
                severity: severity as any,
                dataJson: dataJson as any,
                aiScore,
                aiWhyJson,
                isNew: true,
                lastSeenAt: new Date(),
              },
            });
          }
        }
      }

      // -------------------------
      // PORT EXPOSURE FINDING (MVP)
      // -------------------------
      const expectedOpenPorts = [80, 443];
      const exposedPorts = ports.openPorts.filter((p) => !expectedOpenPorts.includes(p));

      const criticalPorts = [22, 3389];
      const highPorts = [8080, 8443, 3000];

      if (exposedPorts.length > 0) {
        const severity = exposedPorts.some((p) => criticalPorts.includes(p))
          ? "CRITICAL"
          : exposedPorts.some((p) => highPorts.includes(p))
            ? "HIGH"
            : "MEDIUM";

        const key = `PORT_EXPOSED:${domain}`;
        const aiScore = severity === "CRITICAL" ? 95 : severity === "HIGH" ? 85 : 70;

        const aiWhyJson = {
          reasons: [`Unexpected open ports detected: ${exposedPorts.join(", ")}`],
          signals: { openPorts: ports.openPorts, exposedPorts },
        };

        const existing = await this.prisma.finding.findFirst({
          where: { assetId: asset.id, key },
          select: { id: true },
        });

        const dataJson = {
          openPorts: ports.openPorts,
          exposedPorts,
          results: ports.results,
        };

        if (existing) {
          await this.prisma.finding.update({
            where: { id: existing.id },
            data: {
              scanRunId: run.id,
              type: "PORT_EXPOSED",
              severity: severity as any,
              dataJson: dataJson as any,
              aiScore,
              aiWhyJson,
              isNew: false,
              lastSeenAt: new Date(),
            },
          });
        } else {
          await this.prisma.finding.create({
            data: {
              assetId: asset.id,
              scanRunId: run.id,
              type: "PORT_EXPOSED",
              key,
              severity: severity as any,
              dataJson: dataJson as any,
              aiScore,
              aiWhyJson,
              isNew: true,
              lastSeenAt: new Date(),
            },
          });
        }
      }

      // -------------------------
      // TLS CHECK + snapshot
      // -------------------------
      const tlsSkipped = explicitPort !== null && explicitPort !== 443;

      const tlsInfo: TlsInfo = tlsSkipped
        ? {
          host: hostOnly,
          validTo: null,
          daysLeft: null,
          issuer: null,
          subject: null,
          serialNumber: null,
          fingerprint256: null,
          error: "TLS skipped (custom port on asset value)",
        }
        : await this.getTlsInfo(hostOnly);

      await this.prisma.scanCheckResult.create({
        data: {
          scanRunId: run.id,
          type: "TLS_INFO",
          dataJson: tlsInfo as any,
        },
      });

      // --- TLS CHANGE DETECTION (Diff) ---
      if (!tlsSkipped) {
        const prevTlsSnap = await this.prisma.scanCheckResult.findFirst({
          where: {
            type: "TLS_INFO",
            scanRun: {
              assetId: asset.id,
              status: "DONE",
              id: { not: run.id },
            },
          },
          orderBy: { createdAt: "desc" },
          select: { dataJson: true },
        });

        if (prevTlsSnap) {
          const prev = prevTlsSnap.dataJson as any;
          const curr = tlsInfo as any;

          const prevHadError = !!prev?.error;
          const currHadError = !!curr?.error;
          const errorStateChanged = prevHadError !== currHadError;

          const prevFp = prev?.fingerprint256 ?? null;
          const currFp = curr?.fingerprint256 ?? null;

          const prevSerial = prev?.serialNumber ?? null;
          const currSerial = curr?.serialNumber ?? null;

          const prevIssuer = prev?.issuer ?? null;
          const currIssuer = curr?.issuer ?? null;

          const prevSubject = prev?.subject ?? null;
          const currSubject = curr?.subject ?? null;

          const prevValidTo = prev?.validTo ?? null;
          const currValidTo = curr?.validTo ?? null;

          const fingerprintChanged = prevFp !== currFp && (prevFp || currFp);
          const serialChanged = prevSerial !== currSerial && (prevSerial || currSerial);
          const issuerChanged = prevIssuer !== currIssuer && (prevIssuer || currIssuer);
          const subjectChanged = prevSubject !== currSubject && (prevSubject || currSubject);

          // validToChanged en son fallback (asıl sinyal fingerprint/serial)
          const validToChanged = prevValidTo !== currValidTo && (prevValidTo || currValidTo);

          const anyTlsChange =
            errorStateChanged || fingerprintChanged || serialChanged || issuerChanged || subjectChanged || validToChanged;

          if (anyTlsChange) {
            const key = `TLS_CHANGE:${domain}`;

            const severity =
              currHadError && !prevHadError
                ? "HIGH" // eskiden ok, şimdi hata
                : !currHadError && prevHadError
                  ? "LOW" // eskiden hata, şimdi düzeldi
                  : "MEDIUM"; // sertifika kimliği değişti

            const aiScore = severity === "HIGH" ? 85 : severity === "MEDIUM" ? 70 : 30;

            const reasons: string[] = [];
            if (fingerprintChanged) reasons.push(`TLS fingerprint changed`);
            if (serialChanged) reasons.push(`TLS serial changed: ${prevSerial} -> ${currSerial}`);
            if (issuerChanged) reasons.push(`TLS issuer changed`);
            if (subjectChanged) reasons.push(`TLS subject changed`);
            if (validToChanged) reasons.push(`TLS validTo changed: ${prevValidTo} -> ${currValidTo}`);
            if (errorStateChanged) reasons.push(`TLS error state changed: ${prevHadError} -> ${currHadError}`);

            const aiWhyJson = {
              reasons,
              signals: {
                prev: {
                  validTo: prevValidTo,
                  issuer: prevIssuer,
                  subject: prevSubject,
                  serialNumber: prevSerial,
                  fingerprint256: prevFp,
                  error: prev?.error ?? null,
                },
                curr: {
                  validTo: currValidTo,
                  issuer: currIssuer,
                  subject: currSubject,
                  serialNumber: currSerial,
                  fingerprint256: currFp,
                  error: curr?.error ?? null,
                },
              },
            };

            const existing = await this.prisma.finding.findFirst({
              where: { assetId: asset.id, key },
              select: { id: true },
            });

            const dataJson = {
              prev: {
                validTo: prevValidTo,
                issuer: prevIssuer,
                subject: prevSubject,
                serialNumber: prevSerial,
                fingerprint256: prevFp,
                error: prev?.error ?? null,
              },
              curr: {
                validTo: currValidTo,
                issuer: currIssuer,
                subject: currSubject,
                serialNumber: currSerial,
                fingerprint256: currFp,
                error: curr?.error ?? null,
              },
              changed: {
                fingerprintChanged,
                serialChanged,
                issuerChanged,
                subjectChanged,
                validToChanged,
                errorStateChanged,
              },
            };

            if (existing) {
              await this.prisma.finding.update({
                where: { id: existing.id },
                data: {
                  scanRunId: run.id,
                  type: "TLS_CHANGE",
                  severity: severity as any,
                  dataJson: dataJson as any,
                  aiScore,
                  aiWhyJson,
                  isNew: false,
                  lastSeenAt: new Date(),
                },
              });
            } else {
              await this.prisma.finding.create({
                data: {
                  assetId: asset.id,
                  scanRunId: run.id,
                  type: "TLS_CHANGE",
                  key,
                  severity: severity as any,
                  dataJson: dataJson as any,
                  aiScore,
                  aiWhyJson,
                  isNew: true,
                  lastSeenAt: new Date(),
                },
              });
            }
          }
        }
      }

      // TLS_CHECK (okunamazsa) - skip durumunda finding yazmıyoruz
      if (tlsInfo.error && !tlsSkipped) {
        const severity = "HIGH";
        const key = `TLS_CHECK:${domain}`;
        const aiScore = 80;

        const aiWhyJson = {
          reasons: ["TLS handshake failed or certificate could not be read"],
          signals: tlsInfo,
        };

        const existing = await this.prisma.finding.findFirst({
          where: { assetId: asset.id, key },
          select: { id: true },
        });

        if (existing) {
          await this.prisma.finding.update({
            where: { id: existing.id },
            data: {
              scanRunId: run.id,
              type: "TLS_CHECK",
              severity: severity as any,
              dataJson: tlsInfo as any,
              aiScore,
              aiWhyJson,
              isNew: false,
              lastSeenAt: new Date(),
            },
          });
        } else {
          await this.prisma.finding.create({
            data: {
              assetId: asset.id,
              scanRunId: run.id,
              type: "TLS_CHECK",
              key,
              severity: severity as any,
              dataJson: tlsInfo as any,
              aiScore,
              aiWhyJson,
              isNew: true,
              lastSeenAt: new Date(),
            },
          });
        }
      }

      // TLS_EXPIRY (okunursa ve 7 gün altı)
      if (!tlsInfo.error && typeof tlsInfo.daysLeft === "number") {
        const daysLeft = tlsInfo.daysLeft;

        if (daysLeft <= 7) {
          const severity = daysLeft <= 1 ? "CRITICAL" : "HIGH";
          const key = `TLS_EXPIRY:${domain}`;
          const aiScore = daysLeft <= 1 ? 95 : 85;

          const aiWhyJson = {
            reasons: [`TLS certificate expires in ${daysLeft} day(s)`],
            signals: tlsInfo,
          };

          const existing = await this.prisma.finding.findFirst({
            where: { assetId: asset.id, key },
            select: { id: true },
          });

          if (existing) {
            await this.prisma.finding.update({
              where: { id: existing.id },
              data: {
                scanRunId: run.id,
                type: "TLS_EXPIRY",
                severity: severity as any,
                dataJson: tlsInfo as any,
                aiScore,
                aiWhyJson,
                isNew: false,
                lastSeenAt: new Date(),
              },
            });
          } else {
            await this.prisma.finding.create({
              data: {
                assetId: asset.id,
                scanRunId: run.id,
                type: "TLS_EXPIRY",
                key,
                severity: severity as any,
                dataJson: tlsInfo as any,
                aiScore,
                aiWhyJson,
                isNew: true,
                lastSeenAt: new Date(),
              },
            });
          }
        }
      }
      // TLS_CHECK önce vardı ama artık TLS okunuyorsa -> resolvedAt doldur
      if (!tlsSkipped && !tlsInfo.error) {
        const key = `TLS_CHECK:${domain}`;

        const existing = await this.prisma.finding.findFirst({
          where: { assetId: asset.id, key },
          select: { id: true, resolvedAt: true },
        });

        if (existing && !existing.resolvedAt) {
          await this.prisma.finding.update({
            where: { id: existing.id },
            data: {
              resolvedAt: new Date(),
              lastSeenAt: new Date(),
            },
          });
        }
      }

      // -------------------------
      // HTTP HEALTH CHECK + snapshot
      // -------------------------
      const attempt = async (url: string): Promise<HealthOk> => {
        const started = Date.now();
        const res = await axios.get(url, {
          timeout: 5000,
          validateStatus: () => true,
        });
        return { url, statusCode: res.status, latencyMs: Date.now() - started };
      };

      let health: HealthResult;

      try {
        health = await attempt(`https://${domain}`);
      } catch {
        try {
          health = await attempt(`http://${domain}`);
        } catch {
          health = {
            url: `https://${domain}`,
            statusCode: null,
            latencyMs: null,
            error: "HTTP request failed (timeout/DNS/connection)",
          };
        }
      }

      await this.prisma.scanCheckResult.create({
        data: {
          scanRunId: run.id,
          type: "HTTP_HEALTH",
          dataJson: health as any,
        },
      });

      // --- HTTP CHANGE DETECTION (Diff) ---
      const prevHttpSnap = await this.prisma.scanCheckResult.findFirst({
        where: {
          type: "HTTP_HEALTH",
          scanRun: {
            assetId: asset.id,
            status: "DONE",
            id: { not: run.id },
          },
        },
        orderBy: { createdAt: "desc" },
        select: { dataJson: true },
      });

      if (prevHttpSnap) {
        const prev = prevHttpSnap.dataJson as any;
        const curr = health as any;

        const prevStatus = prev?.statusCode ?? null;
        const currStatus = curr?.statusCode ?? null;

        const prevLatency = prev?.latencyMs ?? null;
        const currLatency = curr?.latencyMs ?? null;

        const statusChanged = prevStatus !== currStatus;

        const latencySpike =
          typeof prevLatency === "number" &&
          typeof currLatency === "number" &&
          currLatency - prevLatency >= 300;

        if (statusChanged || latencySpike) {
          const key = `HTTP_CHANGE:${domain}`;

          const severity =
            currStatus === null
              ? "CRITICAL"
              : typeof currStatus === "number" && currStatus >= 500
                ? "HIGH"
                : latencySpike
                  ? "MEDIUM"
                  : "LOW";

          const aiScore =
            severity === "CRITICAL"
              ? 95
              : severity === "HIGH"
                ? 85
                : severity === "MEDIUM"
                  ? 70
                  : 30;

          const aiWhyJson = {
            reasons: [
              statusChanged ? `HTTP status changed: ${prevStatus} -> ${currStatus}` : "HTTP status unchanged",
              latencySpike ? `Latency spike: ${prevLatency}ms -> ${currLatency}ms` : "No latency spike",
            ],
            signals: { prev, curr },
          };

          const existing = await this.prisma.finding.findFirst({
            where: { assetId: asset.id, key },
            select: { id: true },
          });

          const dataJson = {
            prevStatus,
            currStatus,
            prevLatency,
            currLatency,
            statusChanged,
            latencySpike,
          };

          if (existing) {
            await this.prisma.finding.update({
              where: { id: existing.id },
              data: {
                scanRunId: run.id,
                type: "HTTP_CHANGE",
                severity: severity as any,
                dataJson: dataJson as any,
                aiScore,
                aiWhyJson,
                isNew: false,
                lastSeenAt: new Date(),
              },
            });
          } else {
            await this.prisma.finding.create({
              data: {
                assetId: asset.id,
                scanRunId: run.id,
                type: "HTTP_CHANGE",
                key,
                severity: severity as any,
                dataJson: dataJson as any,
                aiScore,
                aiWhyJson,
                isNew: true,
                lastSeenAt: new Date(),
              },
            });
          }
        }
      }

      // HTTP_HEALTH finding (500/timeout)
      const shouldCreateFinding =
        health.statusCode === null ||
        (typeof health.statusCode === "number" && health.statusCode >= 500);

      if (shouldCreateFinding) {
        const severity =
          health.statusCode === null ? "CRITICAL" : health.statusCode >= 500 ? "HIGH" : "LOW";

        const key = `HTTP_HEALTH:${domain}`;
        const aiScore = health.statusCode === null ? 95 : health.statusCode >= 500 ? 85 : 20;

        const aiWhyJson = {
          reasons:
            health.statusCode === null
              ? ["HTTP request failed (timeout/DNS/connection)"]
              : [`HTTP status ${health.statusCode}`],
          signals: health,
        };

        const existing = await this.prisma.finding.findFirst({
          where: { assetId: asset.id, key },
          select: { id: true },
        });

        if (existing) {
          await this.prisma.finding.update({
            where: { id: existing.id },
            data: {
              scanRunId: run.id,
              type: "HTTP_HEALTH",
              severity: severity as any,
              dataJson: health as any,
              aiScore,
              aiWhyJson,
              isNew: false,
              lastSeenAt: new Date(),
            },
          });
        } else {
          await this.prisma.finding.create({
            data: {
              assetId: asset.id,
              scanRunId: run.id,
              type: "HTTP_HEALTH",
              key,
              severity: severity as any,
              dataJson: health as any,
              aiScore,
              aiWhyJson,
              isNew: true,
              lastSeenAt: new Date(),
            },
          });
        }
      }

      // -------------------------
      // Finish ScanRun
      // -------------------------
      const finished = await this.prisma.scanRun.update({
        where: { id: run.id },
        data: {
          status: "DONE",
          finishedAt: new Date(),
        },
        select: { id: true, startedAt: true, finishedAt: true, status: true },
      });

      return {
        ok: true,
        message: shouldCreateFinding ? "Scan finished. Finding recorded." : "Scan finished. No finding (healthy).",
        asset,
        ports,
        tls: tlsInfo,
        health,
        run: finished,
      };
    } catch (err) {
      await this.prisma.scanRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
        },
      });

      throw new InternalServerErrorException("Scan failed");
    }
  }
}