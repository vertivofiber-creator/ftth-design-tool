import React from 'react';
import { FtthComponentType } from '../types/ftth';

interface TelecomSymbolProps {
  type: FtthComponentType;
  width: number;
  height: number;
  color?: string;
  isSelected?: boolean;
  isHighlighted?: boolean;
  darkMode?: boolean;
  code?: string;
  couplingRatio?: string;
  inColor?: string;
  out1Color?: string;
  out2Color?: string;
}

export const TelecomSymbol: React.FC<TelecomSymbolProps> = ({
  type,
  width,
  height,
  color,
  isSelected,
  isHighlighted,
  darkMode = true,
  couplingRatio,
  inColor,
  out1Color,
  out2Color,
}) => {
  const stroke = isSelected
    ? '#38BDF8'
    : isHighlighted
    ? '#10B981'
    : color || (darkMode ? '#CBD5E1' : '#1E293B');
  const fillBg = darkMode ? '#111827' : '#FFFFFF';
  const fillSoft = darkMode ? '#1E293B' : '#F1F5F9';
  const textCol = darkMode ? '#E2E8F0' : '#0F172A';

  // Use a normalized 100x80 viewBox for clean vector scaling inside node box
  const renderSymbolBody = () => {
    switch (type) {
      case 'olt':
      case 'olt_chassis':
        return (
          <g>
            <rect x="4" y="6" width="92" height="68" rx="4" fill={fillBg} stroke={stroke} strokeWidth="2.5" />
            <rect x="10" y="12" width="80" height="14" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="1.2" />
            <rect x="10" y="30" width="80" height="14" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="1.2" />
            <rect x="10" y="48" width="80" height="18" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="1.2" />
            {[18, 28, 38, 48, 58, 68, 78].map((px) => (
              <rect key={px} x={px} y="53" width="5" height="8" rx="1" fill="#38BDF8" />
            ))}
            <circle cx="18" cy="19" r="2.5" fill="#10B981" />
            <circle cx="26" cy="19" r="2.5" fill="#38BDF8" />
            <text x="56" y="22" fontSize="8" fontWeight="700" fill={textCol} textAnchor="middle">
              {type === 'olt_chassis' ? 'OLT RACK' : 'OLT'}
            </text>
          </g>
        );

      case 'olt_line_card':
        return (
          <g>
            <rect x="6" y="10" width="88" height="60" rx="3" fill={fillBg} stroke={stroke} strokeWidth="2.2" />
            <line x1="18" y1="10" x2="18" y2="70" stroke={stroke} strokeWidth="1.5" />
            {[20, 30, 40, 50, 60].map((py) => (
              <rect key={py} x="26" y={py} width="58" height="5" rx="1" fill={fillSoft} stroke={stroke} strokeWidth="0.9" />
            ))}
            <text x="54" y="18" fontSize="7" fontWeight="700" fill={textCol} textAnchor="middle">
              LINE CARD
            </text>
          </g>
        );

      case 'gpon_port':
      case 'xgs_pon_port':
        return (
          <g>
            <rect x="8" y="14" width="84" height="52" rx="4" fill={fillBg} stroke={stroke} strokeWidth="2.2" />
            <rect x="20" y="24" width="60" height="20" rx="2" fill={fillSoft} stroke="#0EA5E9" strokeWidth="1.5" />
            <rect x="66" y="28" width="10" height="12" fill="#0EA5E9" />
            <text x="42" y="37" fontSize="9" fontWeight="700" fill={textCol} textAnchor="middle">
              {type === 'xgs_pon_port' ? 'XGS-PON' : 'GPON'}
            </text>
            <text x="50" y="58" fontSize="7" fill={stroke} textAnchor="middle">
              SFP+ PORT
            </text>
          </g>
        );

      case 'odf':
      case 'patch_panel':
        return (
          <g>
            <rect x="6" y="8" width="88" height="64" rx="3" fill={fillBg} stroke={stroke} strokeWidth="2.2" />
            <line x1="6" y1="26" x2="94" y2="26" stroke={stroke} strokeWidth="1.2" />
            <line x1="6" y1="46" x2="94" y2="46" stroke={stroke} strokeWidth="1.2" />
            {[20, 34, 48, 62, 76].map((px) => (
              <g key={px}>
                <circle cx={px} cy="36" r="3" fill="#22C55E" />
                <circle cx={px} cy="56" r="3" fill="#22C55E" />
              </g>
            ))}
            <text x="50" y="20" fontSize="9" fontWeight="700" fill={textCol} textAnchor="middle">
              {type === 'odf' ? 'ODF' : 'PATCH PANEL'}
            </text>
          </g>
        );

      case 'patch_cord':
        return (
          <g>
            <rect x="6" y="28" width="18" height="24" rx="2" fill={fillSoft} stroke="#22C55E" strokeWidth="2" />
            <rect x="76" y="28" width="18" height="24" rx="2" fill={fillSoft} stroke="#22C55E" strokeWidth="2" />
            <path d="M 24 40 C 40 16, 60 64, 76 40" fill="none" stroke="#FACC15" strokeWidth="3.5" />
          </g>
        );

      case 'feeder_cable':
      case 'distribution_cable':
      case 'drop_cable':
      case 'indoor_cable':
      case 'outdoor_cable':
      case 'underground_cable':
      case 'aerial_cable':
      case 'microduct_cable': {
        const labelMap: Record<string, string> = {
          feeder_cable: 'FEEDER',
          distribution_cable: 'DIST',
          drop_cable: 'DROP',
          indoor_cable: 'INDOOR',
          outdoor_cable: 'OUTDOOR',
          underground_cable: 'UGD',
          aerial_cable: 'AERIAL',
          microduct_cable: 'DUCT',
        };
        return (
          <g>
            <rect x="6" y="18" width="88" height="44" rx="22" fill={fillBg} stroke={stroke} strokeWidth="2.2" />
            <circle cx="24" cy="40" r="10" fill={fillSoft} stroke={stroke} strokeWidth="1.6" />
            <circle cx="24" cy="40" r="3" fill={stroke} />
            <line x1="34" y1="40" x2="86" y2="40" stroke={stroke} strokeWidth="3" strokeDasharray={type === 'underground_cable' ? '6,3' : undefined} />
            <text x="60" y="34" fontSize="8.5" fontWeight="700" fill={textCol} textAnchor="middle">
              {labelMap[type]}
            </text>
          </g>
        );
      }

      case 'splitter_1_2':
      case 'splitter_1_4':
      case 'splitter_1_8':
      case 'splitter_1_16':
      case 'splitter_1_32':
      case 'splitter_1_64':
      case 'fbt_splitter': {
        const ratio =
          type === 'fbt_splitter'
            ? 'FBT'
            : type.replace('splitter_', '').replace('_', ':');
        return (
          <g>
            <polygon
              points="10,40 88,6 88,74"
              fill={fillBg}
              stroke={stroke}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <polygon
              points="24,40 82,15 82,65"
              fill={fillSoft}
              stroke="none"
            />
            <text x="62" y="37" fontSize="10" fontWeight="700" fill={textCol} textAnchor="middle">
              {type === 'fbt_splitter' ? 'FBT' : 'PLC'}
            </text>
            <text x="62" y="50" fontSize="9.5" fontWeight="700" fill="#F59E0B" textAnchor="middle">
              {ratio}
            </text>
          </g>
        );
      }

      case 'optical_coupler':
        return (
          <g>
            <rect x="10" y="14" width="80" height="52" rx="6" fill={fillBg} stroke={stroke} strokeWidth="2.2" />
            <line x1="10" y1="28" x2="90" y2="52" stroke={out2Color || '#F59E0B'} strokeWidth="2.2" />
            <line x1="10" y1="52" x2="90" y2="28" stroke={out1Color || '#38BDF8'} strokeWidth="2.2" />
            <circle cx="50" cy="40" r="8" fill={fillSoft} stroke={stroke} strokeWidth="1.5" />
            <text x="50" y="43" fontSize="7" fontWeight="700" fill={textCol} textAnchor="middle">
              CPL
            </text>
          </g>
        );

      case 'ratio_coupler':
        return (
          <g>
            <polygon
              points="10,20 88,8 88,72 10,60"
              fill={fillBg}
              stroke={stroke}
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <line x1="10" y1="40" x2="36" y2="40" stroke={inColor || '#10B981'} strokeWidth="2.6" />
            <path d="M 36 40 L 88 24" fill="none" stroke={out1Color || '#EF4444'} strokeWidth="2.8" />
            <path d="M 36 40 L 88 56" fill="none" stroke={out2Color || '#3B82F6'} strokeWidth="2.4" />
            <circle cx="36" cy="40" r="4.5" fill="#F59E0B" stroke={fillBg} strokeWidth="1" />
          </g>
        );

      case 'optical_attenuator':
        return (
          <g>
            <rect x="8" y="18" width="84" height="44" rx="4" fill={fillBg} stroke={stroke} strokeWidth="2.2" />
            <polyline
              points="18,40 28,40 34,26 44,54 54,26 64,54 70,40 82,40"
              fill="none"
              stroke="#EF4444"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
          </g>
        );

      case 'joint_closure':
        return (
          <g>
            <rect x="12" y="16" width="76" height="48" rx="18" fill={fillBg} stroke={stroke} strokeWidth="2.4" />
            <line x1="34" y1="16" x2="34" y2="64" stroke={stroke} strokeWidth="1.6" />
            <line x1="66" y1="16" x2="66" y2="64" stroke={stroke} strokeWidth="1.6" />
            <circle cx="50" cy="40" r="9" fill={fillSoft} stroke="#A855F7" strokeWidth="1.6" />
            <line x1="44" y1="40" x2="56" y2="40" stroke="#A855F7" strokeWidth="2" />
          </g>
        );

      case 'fiber_splice':
        return (
          <g>
            <rect x="14" y="22" width="72" height="36" rx="18" fill={fillBg} stroke={stroke} strokeWidth="2.2" />
            <line x1="20" y1="40" x2="44" y2="40" stroke="#38BDF8" strokeWidth="2.4" />
            <line x1="56" y1="40" x2="80" y2="40" stroke="#38BDF8" strokeWidth="2.4" />
            <line x1="45" y1="30" x2="55" y2="50" stroke="#F59E0B" strokeWidth="2.5" />
            <line x1="55" y1="30" x2="45" y2="50" stroke="#F59E0B" strokeWidth="2.5" />
          </g>
        );

      case 'fat':
      case 'fdb':
      case 'fdt':
      case 'ftb':
      case 'fiber_termination_box': {
        const label =
          type === 'fat'
            ? 'FAT'
            : type === 'fdb'
            ? 'FDB'
            : type === 'fdt'
            ? 'FDT'
            : type === 'ftb'
            ? 'FTB'
            : 'FTBX';
        return (
          <g>
            <rect x="10" y="8" width="80" height="64" rx="5" fill={fillBg} stroke={stroke} strokeWidth="2.4" />
            <rect x="16" y="14" width="68" height="52" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="1" />
            <path d="M 30 30 L 42 30 L 42 52 L 58 52 L 58 30 L 70 30" fill="none" stroke="#EC4899" strokeWidth="2" />
            <text x="50" y="25" fontSize="10" fontWeight="700" fill={textCol} textAnchor="middle">
              {label}
            </text>
          </g>
        );
      }

      case 'pole':
        return (
          <g>
            <circle cx="50" cy="40" r="26" fill={fillBg} stroke={stroke} strokeWidth="2.4" />
            <circle cx="50" cy="40" r="10" fill={fillSoft} stroke={stroke} strokeWidth="2" />
            <line x1="24" y1="40" x2="76" y2="40" stroke={stroke} strokeWidth="1.8" />
            <line x1="50" y1="14" x2="50" y2="66" stroke={stroke} strokeWidth="1.8" />
          </g>
        );

      case 'manhole':
        return (
          <g>
            <rect x="14" y="14" width="72" height="52" rx="4" fill={fillBg} stroke={stroke} strokeWidth="2.4" />
            <circle cx="50" cy="40" r="18" fill={fillSoft} stroke={stroke} strokeWidth="1.8" />
            <text x="50" y="44" fontSize="10" fontWeight="700" fill={textCol} textAnchor="middle">
              MH
            </text>
          </g>
        );

      case 'handhole':
        return (
          <g>
            <rect x="16" y="18" width="68" height="44" rx="4" fill={fillBg} stroke={stroke} strokeWidth="2.4" strokeDasharray="5,2" />
            <rect x="24" y="25" width="52" height="30" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="1.2" />
            <text x="50" y="44" fontSize="10" fontWeight="700" fill={textCol} textAnchor="middle">
              HH
            </text>
          </g>
        );

      case 'cabinet':
        return (
          <g>
            <rect x="14" y="8" width="72" height="64" rx="3" fill={fillBg} stroke={stroke} strokeWidth="2.4" />
            <line x1="50" y1="8" x2="50" y2="72" stroke={stroke} strokeWidth="1.5" />
            <rect x="42" y="34" width="4" height="12" fill={stroke} />
            <rect x="54" y="34" width="4" height="12" fill={stroke} />
            <text x="50" y="23" fontSize="9" fontWeight="700" fill={textCol} textAnchor="middle">
              CAB
            </text>
          </g>
        );

      case 'onu':
      case 'ont':
      case 'wifi_ont':
        return (
          <g>
            <rect x="10" y="22" width="80" height="46" rx="6" fill={fillBg} stroke={stroke} strokeWidth="2.4" />
            {type === 'wifi_ont' && (
              <>
                <line x1="28" y1="22" x2="24" y2="6" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
                <line x1="72" y1="22" x2="76" y2="6" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
              </>
            )}
            <circle cx="24" cy="45" r="3" fill="#10B981" />
            <circle cx="34" cy="45" r="3" fill="#38BDF8" />
            <text x="60" y="49" fontSize="10" fontWeight="700" fill={textCol} textAnchor="middle">
              {type === 'wifi_ont' ? 'Wi-Fi ONT' : type.toUpperCase()}
            </text>
          </g>
        );

      case 'customer_termination_box':
      case 'rosette_box':
        return (
          <g>
            <rect x="16" y="16" width="68" height="48" rx="4" fill={fillBg} stroke={stroke} strokeWidth="2.2" />
            <rect x="34" y="30" width="32" height="20" rx="2" fill={fillSoft} stroke="#22C55E" strokeWidth="1.5" />
            <text x="50" y="25" fontSize="8" fontWeight="700" fill={textCol} textAnchor="middle">
              {type === 'rosette_box' ? 'ATB' : 'CTB'}
            </text>
          </g>
        );

      case 'text_label':
        return (
          <g>
            <rect x="4" y="12" width="92" height="56" rx="3" fill="none" stroke={stroke} strokeWidth="1.2" strokeDasharray="4,3" />
            <text x="50" y="46" fontSize="14" fontWeight="700" fill={textCol} textAnchor="middle">
              AaBb
            </text>
          </g>
        );

      case 'note_box':
        return (
          <g>
            <polygon points="8,8 78,8 92,22 92,72 8,72" fill={fillSoft} stroke="#FBBF24" strokeWidth="2" />
            <polyline points="78,8 78,22 92,22" fill="none" stroke="#FBBF24" strokeWidth="2" />
            <line x1="18" y1="30" x2="78" y2="30" stroke={textCol} strokeWidth="1.5" opacity="0.6" />
            <line x1="18" y1="44" x2="72" y2="44" stroke={textCol} strokeWidth="1.5" opacity="0.6" />
            <line x1="18" y1="58" x2="60" y2="58" stroke={textCol} strokeWidth="1.5" opacity="0.6" />
          </g>
        );
    }
  };

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 80"
      preserveAspectRatio="none"
      className="overflow-visible pointer-events-none select-none"
    >
      {renderSymbolBody()}
    </svg>
  );
};
