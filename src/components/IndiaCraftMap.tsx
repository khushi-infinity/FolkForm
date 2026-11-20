import React, { useMemo, useState } from 'react';
import { ArrowRight, Compass, MapPin } from 'lucide-react';
import indiaMap from '@svg-maps/india';
import type { ArtisanCluster } from '../types';

interface IndiaCraftMapProps {
  clusters: ArtisanCluster[];
  onExploreCluster: (state: string) => void;
}

interface IndiaLocation {
  id: string;
  name: string;
  path: string;
}

// Calibrated Web Mercator projection matching @svg-maps/india (viewBox 0 0 612 696)
const LON_MIN = 68.18;
const LON_MAX = 97.41;
const LAT_MAX = 37.09;
const LAT_MIN = 8.07;

function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

const MERC_MAX = mercatorY(LAT_MAX);
const MERC_MIN = mercatorY(LAT_MIN);

function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * 611.9;
  const y = ((MERC_MAX - mercatorY(lat)) / (MERC_MAX - MERC_MIN)) * 667.8;
  return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
}

// Exact geographic coordinates (latitude, longitude) & non-overlapping cartographic label offsets
const CLUSTER_GEO: Record<
  string,
  {
    lat: number;
    lon: number;
    shortLabel: string;
    stateIds: string[];
    labelDx: number;
    labelDy: number;
    anchor: 'start' | 'end' | 'middle';
  }
> = {
  'cluster-kashmir': {
    lat: 34.0837,
    lon: 74.7973,
    shortLabel: 'Srinagar',
    stateIds: ['jk'],
    labelDx: -14,
    labelDy: 4,
    anchor: 'end',
  },
  'cluster-moradabad': {
    lat: 28.8386,
    lon: 78.7733,
    shortLabel: 'Moradabad',
    stateIds: ['up'],
    labelDx: 14,
    labelDy: -6,
    anchor: 'start',
  },
  'cluster-jaipur': {
    lat: 26.9124,
    lon: 75.7873,
    shortLabel: 'Jaipur',
    stateIds: ['rj'],
    labelDx: -14,
    labelDy: 4,
    anchor: 'end',
  },
  'cluster-varanasi': {
    lat: 25.3176,
    lon: 82.9739,
    shortLabel: 'Varanasi',
    stateIds: ['up'],
    labelDx: 14,
    labelDy: 4,
    anchor: 'start',
  },
  'cluster-kutch': {
    lat: 23.242,
    lon: 69.6669,
    shortLabel: 'Bhuj · Kutch',
    stateIds: ['gj'],
    labelDx: -8,
    labelDy: -14,
    anchor: 'start',
  },
  'cluster-odisha': {
    lat: 19.8825,
    lon: 85.829,
    shortLabel: 'Raghurajpur',
    stateIds: ['or'],
    labelDx: 14,
    labelDy: 5,
    anchor: 'start',
  },
  'cluster-channapatna': {
    lat: 12.6518,
    lon: 77.2067,
    shortLabel: 'Channapatna',
    stateIds: ['ka'],
    labelDx: -14,
    labelDy: 4,
    anchor: 'end',
  },
  'cluster-tamilnadu': {
    lat: 10.787,
    lon: 79.1378,
    shortLabel: 'Thanjavur',
    stateIds: ['tn'],
    labelDx: 14,
    labelDy: 6,
    anchor: 'start',
  },
};

const STATE_NAME_TO_ID: Record<string, string> = {
  Rajasthan: 'rj',
  'Uttar Pradesh': 'up',
  Gujarat: 'gj',
  Karnataka: 'ka',
  'Jammu & Kashmir': 'jk',
  Odisha: 'or',
  'Tamil Nadu': 'tn',
};

export const IndiaCraftMap: React.FC<IndiaCraftMapProps> = ({ clusters, onExploreCluster }) => {
  const [selectedId, setSelectedId] = useState<string>(clusters[0]?.id || 'cluster-jaipur');
  const [hoveredStateName, setHoveredStateName] = useState<string | null>(null);

  const locations = (indiaMap as unknown as { locations: IndiaLocation[] }).locations;

  const activeCluster = clusters.find((c) => c.id === selectedId) || clusters[0];

  const mappedClusters = useMemo(() => {
    return clusters.map((cluster) => {
      const geo = CLUSTER_GEO[cluster.id];
      const pt = geo
        ? projectLatLon(geo.lat, geo.lon)
        : { x: cluster.mapX * 6.12, y: cluster.mapY * 6.96 };
      return {
        cluster,
        x: pt.x,
        y: pt.y,
        shortLabel:
          geo?.shortLabel ||
          (cluster.state === 'Jammu & Kashmir' ? 'Srinagar' : cluster.name.split(' ')[0]),
        stateIds: geo?.stateIds || (STATE_NAME_TO_ID[cluster.state] ? [STATE_NAME_TO_ID[cluster.state]] : []),
        labelDx: geo?.labelDx ?? 14,
        labelDy: geo?.labelDy ?? 4,
        anchor: geo?.anchor ?? ('start' as const),
      };
    });
  }, [clusters]);

  const activeMapped =
    mappedClusters.find((m) => m.cluster.id === activeCluster?.id) || mappedClusters[0];

  const clusterStateIds = useMemo(() => {
    const map = new Map<string, ArtisanCluster[]>();
    for (const item of mappedClusters) {
      for (const sid of item.stateIds) {
        const list = map.get(sid) || [];
        list.push(item.cluster);
        map.set(sid, list);
      }
    }
    return map;
  }, [mappedClusters]);

  const activeStateIds = useMemo(
    () => new Set(activeMapped?.stateIds || []),
    [activeMapped],
  );

  // Graticule lines projected accurately in lat/lon
  const latLines = [10, 20, 30].map((lat) => ({
    label: `${lat}°N`,
    y: projectLatLon(lat, 75).y,
  }));
  const lonLines = [70, 80, 90].map((lon) => ({
    label: `${lon}°E`,
    x: projectLatLon(20, lon).x,
  }));

  const handleStateClick = (stateId: string) => {
    const matches = clusterStateIds.get(stateId);
    if (!matches || matches.length === 0) return;
    if (matches.length === 1) {
      setSelectedId(matches[0].id);
      return;
    }
    // Cycle between clusters in states with multiple clusters (e.g., Uttar Pradesh: Moradabad & Varanasi)
    const curIdx = matches.findIndex((c) => c.id === selectedId);
    const next = matches[(curIdx + 1) % matches.length];
    setSelectedId(next.id);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
      {/* Geographically Accurate Editorial Map of India */}
      <div className="lg:col-span-7 bg-[#FFFCF6] border border-[#E9DCC7] p-6 sm:p-8 flex flex-col justify-between">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E9DCC7]">
          <div>
            <p className="text-xs tracking-wide text-[#7A5E4B]">
              Interactive Geographic Sourcing Atlas
            </p>
            <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-0.5">
              India’s Heritage Craft Clusters
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#7A5E4B]">
            <span className="truncate max-w-[180px]">
              {hoveredStateName ? hoveredStateName : `${clusters.length} Active Craft Regions`}
            </span>
          </div>
        </div>

        <div className="relative w-full my-4 select-none flex items-center justify-center bg-[#FAF5EA] border border-[#E9DCC7]/80 px-3 py-4">
          <svg
            viewBox="-36 -22 684 744"
            className="w-full max-w-[540px] h-auto max-h-[540px]"
            role="img"
            aria-label="Accurate geographic map of India showing 8 Indian artisan craft clusters"
          >
            {/* Subtle Latitude & Longitude Graticule */}
            <g aria-hidden="true">
              {latLines.map((line) => (
                <g key={line.label}>
                  <line
                    x1="-28"
                    y1={line.y}
                    x2="636"
                    y2={line.y}
                    stroke="#E5D7C1"
                    strokeWidth="0.9"
                    strokeDasharray="4 6"
                  />
                  <text
                    x="-24"
                    y={line.y - 5}
                    fontSize="10"
                    fill="#9B826E"
                    className="font-mono"
                  >
                    {line.label}
                  </text>
                </g>
              ))}
              {lonLines.map((line) => (
                <g key={line.label}>
                  <line
                    x1={line.x}
                    y1="-14"
                    x2={line.x}
                    y2="710"
                    stroke="#E5D7C1"
                    strokeWidth="0.9"
                    strokeDasharray="4 6"
                  />
                  <text
                    x={line.x + 4}
                    y="706"
                    fontSize="10"
                    fill="#9B826E"
                    className="font-mono"
                  >
                    {line.label}
                  </text>
                </g>
              ))}
            </g>

            {/* Editorial Sea & Ocean Labels */}
            <g aria-hidden="true" className="font-serif italic" fill="#A68E79" fontSize="14">
              <text x="12" y="510" letterSpacing="2">
                ARABIAN
              </text>
              <text x="26" y="528" letterSpacing="2">
                SEA
              </text>
              <text x="378" y="525" letterSpacing="2">
                BAY OF
              </text>
              <text x="372" y="543" letterSpacing="2">
                BENGAL
              </text>
              <text x="235" y="704" letterSpacing="3" fontSize="12">
                INDIAN OCEAN
              </text>
            </g>

            {/* Accurate Vector States & Union Territories of India */}
            <g>
              {locations.map((loc) => {
                const hasCluster = clusterStateIds.has(loc.id);
                const isSelectedState = activeStateIds.has(loc.id);
                let fill = '#EFE5D3';
                let stroke = '#C8B397';
                let strokeWidth = 0.9;

                if (isSelectedState) {
                  fill = '#E4C2AE';
                  stroke = '#B05330';
                  strokeWidth = 1.6;
                } else if (hasCluster) {
                  fill = '#E7D8C0';
                  stroke = '#B59B7A';
                  strokeWidth = 1.1;
                }

                return (
                  <path
                    key={loc.id}
                    d={loc.path}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                    className={
                      hasCluster
                        ? 'cursor-pointer transition-colors duration-200 hover:fill-[#E8CBB8]'
                        : 'transition-colors duration-200 hover:fill-[#EAE0CE]'
                    }
                    onMouseEnter={() => setHoveredStateName(loc.name)}
                    onMouseLeave={() => setHoveredStateName(null)}
                    onClick={() => handleStateClick(loc.id)}
                  >
                    <title>{loc.name}</title>
                  </path>
                );
              })}
            </g>

            {/* Subtle Trade Routes from Active Cluster to Other Clusters */}
            {activeMapped && (
              <g aria-hidden="true">
                {mappedClusters.map((item) => {
                  if (item.cluster.id === activeMapped.cluster.id) return null;
                  return (
                    <line
                      key={`route-${item.cluster.id}`}
                      x1={activeMapped.x}
                      y1={activeMapped.y}
                      x2={item.x}
                      y2={item.y}
                      stroke="#BE9753"
                      strokeWidth="1.15"
                      strokeDasharray="3 5"
                      opacity="0.55"
                    />
                  );
                })}
              </g>
            )}

            {/* Geographically Projected Craft Cluster Pins */}
            <g>
              {mappedClusters.map((item) => {
                const isSelected = activeCluster?.id === item.cluster.id;
                const labelX = item.x + item.labelDx;
                const labelY = item.y + item.labelDy;

                return (
                  <g
                    key={item.cluster.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(item.cluster.id)}
                    onMouseEnter={() =>
                      setHoveredStateName(`${item.shortLabel}, ${item.cluster.state}`)
                    }
                    onMouseLeave={() => setHoveredStateName(null)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${item.cluster.name}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(item.cluster.id);
                      }
                    }}
                  >
                    {/* Active halo ring (static, architectural) */}
                    {isSelected && (
                      <>
                        <circle
                          cx={item.x}
                          cy={item.y}
                          r="16"
                          fill="#B05330"
                          opacity="0.14"
                        />
                        <circle
                          cx={item.x}
                          cy={item.y}
                          r="10.5"
                          fill="none"
                          stroke="#B05330"
                          strokeWidth="1.3"
                          opacity="0.7"
                        />
                      </>
                    )}

                    {/* Pin Marker */}
                    <circle
                      cx={item.x}
                      cy={item.y}
                      r={isSelected ? '6.2' : '4.6'}
                      fill={isSelected ? '#B05330' : '#3A2319'}
                      stroke="#FFFCF6"
                      strokeWidth="2"
                    />

                    {/* Crisp Readable Label with Warm Parchment Backing Halo */}
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor={item.anchor}
                      fontSize={isSelected ? '13.5' : '12'}
                      fontWeight={isSelected ? '700' : '600'}
                      fill="#FFFCF6"
                      stroke="#FFFCF6"
                      strokeWidth="4.2"
                      strokeLinejoin="round"
                      className="font-sans select-none"
                    >
                      {item.shortLabel}
                    </text>
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor={item.anchor}
                      fontSize={isSelected ? '13.5' : '12'}
                      fontWeight={isSelected ? '700' : '600'}
                      fill={isSelected ? '#B05330' : '#3A2319'}
                      className="font-sans select-none"
                    >
                      {item.shortLabel}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Minimal Cartographic North Compass (Top Right) */}
            <g transform="translate(568, 38)" aria-hidden="true" opacity="0.75">
              <circle cx="0" cy="0" r="19" fill="#FFFCF6" stroke="#C8B397" strokeWidth="1" />
              <path d="M0 -13 L3.5 0 L0 13 L-3.5 0 Z" fill="#3A2319" />
              <path d="M0 -13 L3.5 0 L0 0 Z" fill="#B05330" />
              <text
                x="0"
                y="-23"
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="#7A5E4B"
                className="font-mono"
              >
                N
              </text>
            </g>
          </svg>
        </div>

        {/* Cartographic Legend + Quick Cluster Selector Buttons */}
        <div className="space-y-3 pt-4 border-t border-[#E9DCC7]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7A5E4B]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B05330] inline-block" />
                Selected Cluster
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3A2319] inline-block" />
                Active Sourcing Hub
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2.5 bg-[#E7D8C0] border border-[#B59B7A] inline-block" />
                Sourcing State
              </span>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#7A5E4B]">
              <Compass className="w-3 h-3 text-[#BE9753]" />
              Click any pin or highlighted state
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {clusters.map((cluster) => {
              const active = activeCluster?.id === cluster.id;
              return (
                <button
                  key={cluster.id}
                  type="button"
                  onClick={() => setSelectedId(cluster.id)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    active
                      ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                      : 'bg-[#F8F3E8] text-[#3A2319] border-[#E9DCC7] hover:border-[#B05330]'
                  }`}
                >
                  {CLUSTER_GEO[cluster.id]?.shortLabel || cluster.state}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Cluster Editorial Dossier */}
      {activeCluster && (
        <div className="lg:col-span-5 bg-[#FFFCF6] border border-[#E9DCC7] p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#7A5E4B]">
              <MapPin className="w-3.5 h-3.5 text-[#B05330]" />
              <span>{activeCluster.state}</span>
              <span aria-hidden="true">·</span>
              <span>{activeCluster.region}</span>
            </div>

            <h3 className="font-serif text-3xl font-semibold text-[#3A2319] mt-3 leading-tight">
              {activeCluster.name}
            </h3>

            <p className="text-sm text-[#5C4334] leading-relaxed mt-4">
              {activeCluster.description}
            </p>

            <div className="mt-6 pt-6 border-t border-[#E9DCC7] space-y-4">
              <div>
                <p className="text-xs font-medium text-[#7A5E4B]">
                  Signature Crafts & Techniques
                </p>
                <p className="text-sm font-medium text-[#3A2319] mt-1">
                  {activeCluster.primaryCrafts}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2">
                <div>
                  <p className="text-xs text-[#7A5E4B]">Est. Cluster Artisans</p>
                  <p className="font-mono text-lg font-medium text-[#3A2319] tabular-nums mt-0.5">
                    {activeCluster.artisanCountEst.toLocaleString('en-IN')}+
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#7A5E4B]">Demo Makers</p>
                  <p className="font-mono text-lg font-medium text-[#3A2319] tabular-nums mt-0.5">
                    {activeCluster.supplierCount ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#7A5E4B]">Active SKUs</p>
                  <p className="font-mono text-lg font-medium text-[#3A2319] tabular-nums mt-0.5">
                    {activeCluster.productCount ?? 0}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[#E9DCC7]">
            <button
              type="button"
              onClick={() => onExploreCluster(activeCluster.state)}
              className="w-full py-3 px-5 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>Browse {activeCluster.state} Catalogue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-[#7A5E4B] mt-3">
              Cluster figures reflect illustrative regional craft demographics and seeded demo
              partners.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
