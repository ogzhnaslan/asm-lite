import { useEffect, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';

export interface GlobePoint {
  lat: number;
  lng: number;
  label?: string;
  name?: string;      // clean domain/IP for the visible label
  location?: string;  // city, country
  color?: string;
  size?: number;
  critical?: boolean;
}

interface SatelliteGlobeProps {
  points?: GlobePoint[];
  width?: number;
  height?: number;
  autoRotate?: boolean;
  initialLat?: number;
  initialLng?: number;
}

const EARTH_NIGHT = '//unpkg.com/three-globe/example/img/earth-night.jpg';

const MARKER_CSS = `
@keyframes asm-ring {
  0%   { transform:translate(-50%,-50%) scale(0.3); opacity:0.75; }
  100% { transform:translate(-50%,-50%) scale(2.6); opacity:0; }
}`;

function injectMarkerStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('asm-globe-styles')) return;
  const s = document.createElement('style');
  s.id = 'asm-globe-styles';
  s.textContent = MARKER_CSS;
  document.head.appendChild(s);
}

function buildMarkerEl(pt: GlobePoint & { _color: string }): HTMLElement {
  const color = pt._color;
  const glow  = color + '50';
  const name  = pt.name ?? '';
  const loc   = pt.location ?? '';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;';

  // Ring 1
  const r1 = document.createElement('div');
  r1.style.cssText = `position:absolute;width:16px;height:16px;border-radius:50%;border:1.5px solid ${color};animation:asm-ring 2.4s ease-out infinite;`;
  wrap.appendChild(r1);

  // Ring 2
  const r2 = document.createElement('div');
  r2.style.cssText = `position:absolute;width:16px;height:16px;border-radius:50%;border:1.5px solid ${color};animation:asm-ring 2.4s ease-out 1.1s infinite;`;
  wrap.appendChild(r2);

  // Core dot
  const dot = document.createElement('div');
  dot.style.cssText = `position:absolute;width:8px;height:8px;border-radius:50%;background:${color};transform:translate(-50%,-50%);box-shadow:0 0 8px ${color},0 0 20px ${glow};`;
  wrap.appendChild(dot);

  // Connector line (SVG, going upper-right)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;overflow:visible;pointer-events:none;';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '0');
  line.setAttribute('y1', '0');
  line.setAttribute('x2', '28');
  line.setAttribute('y2', '-34');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-dasharray', '3,2');
  line.setAttribute('opacity', '0.55');
  svg.appendChild(line);

  // Arrowhead at line tip
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  arrow.setAttribute('points', '28,-34 23,-30 32,-30');
  arrow.setAttribute('fill', color);
  arrow.setAttribute('opacity', '0.7');
  svg.appendChild(arrow);

  wrap.appendChild(svg);

  // Label chip
  const label = document.createElement('div');
  label.style.cssText = [
    'position:absolute',
    'transform:translate(30px,-68px)',
    'background:rgba(2,6,23,0.93)',
    `border:1px solid ${color}40`,
    'border-radius:7px',
    'padding:5px 10px',
    'white-space:nowrap',
    'font-family:ui-monospace,monospace',
    `box-shadow:0 2px 12px rgba(0,0,0,0.5),inset 0 0 0 1px ${color}15`,
  ].join(';');

  const nameLine = document.createElement('div');
  nameLine.style.cssText = `font-size:10px;font-weight:700;color:${color};letter-spacing:0.03em;`;
  nameLine.textContent = name;
  label.appendChild(nameLine);

  if (loc) {
    const locLine = document.createElement('div');
    locLine.style.cssText = 'font-size:9px;color:#94a3b8;margin-top:2px;letter-spacing:0.01em;';
    locLine.textContent = loc;
    label.appendChild(locLine);
  }

  wrap.appendChild(label);
  return wrap;
}

export function SatelliteGlobe({
  points = [],
  width = 500,
  height = 500,
  autoRotate = true,
  initialLat = 20,
  initialLng = 10,
}: SatelliteGlobeProps) {
  const globeRef = useRef<GlobeMethods>(null!);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    injectMarkerStyles();
  }, []);

  useEffect(() => {
    if (!ready || !globeRef.current) return;
    globeRef.current.pointOfView({ lat: initialLat, lng: initialLng, altitude: 2.2 }, 0);
    const controls = globeRef.current.controls();
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = false;
    controls.enablePan = false;
  }, [ready, autoRotate, initialLat, initialLng]);

  const pointData = points.map(p => ({
    ...p,
    _color: p.critical ? '#f87171' : (p.color ?? '#38bdf8'),
    _size:  p.size ?? (p.critical ? 0.45 : 0.35),
  }));

  return (
    <div style={{ position: 'relative' }}>
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid rgba(56,189,248,0.15)',
            borderTopColor: '#38bdf8',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      )}

      <Globe
        ref={globeRef}
        width={width}
        height={height}

        globeImageUrl={EARTH_NIGHT}
        showGraticules={true}
        showAtmosphere={true}
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.18}
        backgroundColor="rgba(0,0,0,0)"

        /* Subtle surface dots (anchor) */
        pointsData={pointData}
        pointLat="lat"
        pointLng="lng"
        pointColor="_color"
        pointRadius={0.2}
        pointAltitude={0.005}
        pointsMerge={false}

        /* HTML marker elements — pulsing ring + arrow + label */
        htmlElementsData={pointData}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.02}
        // @ts-expect-error react-globe.gl types don't expose htmlElement directly
        htmlElement={(d: GlobePoint & { _color: string }) => buildMarkerEl(d)}

        onGlobeReady={() => setReady(true)}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
