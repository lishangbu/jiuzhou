import React from 'react';
import type { PartnerDisplayDto } from '../../../../services/api';
import {
  formatPartnerElementLabel,
  resolvePartnerAvatar,
} from '../../shared/partnerDisplay';
import { getItemQualityMeta } from '../../shared/itemQuality';
import {
  getPartnerVisibleCombatAttrs,
  getPartnerAttrLabel,
  formatPartnerAttrValue,
} from '../../shared/partnerDisplay';

interface MarketPartnerPreviewSheetProps {
  partner: PartnerDisplayDto | null;
  unitPrice?: number;
  sellerCharacterId?: number;
  myCharacterId?: number | null;
  onClose: () => void;
  onBuy?: () => void;
}

const getQualityClassName = (value: unknown): string => {
  return getItemQualityMeta(value)?.className ?? '';
};

const buildPartnerAllAttrsPreview = (partner: PartnerDisplayDto): string[] => {
  return getPartnerVisibleCombatAttrs(partner.computedAttrs)
    .map((entry) => `${getPartnerAttrLabel(entry.key)} ${formatPartnerAttrValue(entry.key, entry.value)}`);
};

const MarketPartnerPreviewSheet: React.FC<MarketPartnerPreviewSheetProps> = ({
  partner,
  unitPrice,
  sellerCharacterId,
  myCharacterId,
  onClose,
  onBuy,
}) => {
  if (!partner) return null;

  const isMyOwn = myCharacterId !== null && myCharacterId !== undefined && sellerCharacterId === myCharacterId;
  const canBuy = !!onBuy && !isMyOwn;

  return (
    <>
      <div className="market-list-sheet-mask" onClick={onClose} />
      <div className="market-list-sheet">
        <div className="market-list-sheet-handle">
          <div className="market-list-sheet-bar" />
        </div>

        {/* 头部 */}
        <div className="market-list-sheet-head">
          <div className="market-list-sheet-head-main">
            <div className="market-list-sheet-icon-box">
              <img className="market-list-sheet-icon-img" style={{ borderRadius: '12px', width: '100%', height: '100%' }} src={resolvePartnerAvatar(partner.avatar)} alt={partner.name} />
            </div>
            <div className="market-list-sheet-meta">
              <div className="market-list-sheet-name">
                {partner.nickname || partner.name}
              </div>
              <div className="market-list-sheet-tags">
                <span className={`market-list-sheet-tag market-list-sheet-tag--quality ${getQualityClassName(partner.quality)}`}>
                  {partner.quality}
                </span>
                <span className="market-list-sheet-tag">{formatPartnerElementLabel(partner.element)}</span>
                <span className="market-list-sheet-tag">{partner.role}</span>
                <span className="market-list-sheet-tag">等级 {partner.level}</span>
              </div>
              <div className="market-list-sheet-qty">{partner.name}</div>
            </div>
          </div>
        </div>

        {/* 详情 */}
        <div className="market-list-sheet-body">
          <div className="market-list-sheet-section">
            <div className="market-list-sheet-section-title">属性</div>
            <div className="market-list-sheet-effect-list">
              {buildPartnerAllAttrsPreview(partner).map((line) => (
                <div key={line} className="market-list-sheet-effect-chip">{line}</div>
              ))}
            </div>
          </div>
          <div className="market-list-sheet-section">
            <div className="market-list-sheet-section-title">功法</div>
            <div className="market-partner-technique-grid">
              {partner.techniques.length > 0 ? (
                partner.techniques.map((tech) => (
                  <div key={tech.techniqueId} className="market-partner-technique-cell">
                    <div className="market-partner-technique-name">{tech.name} <span className="market-partner-technique-level">一层</span></div>
                    <div className="market-partner-technique-desc">{tech.description || '暂无描述'}</div>
                  </div>
                ))
              ) : (
                <div className="market-list-detail-text">暂无功法</div>
              )}
            </div>
          </div>
        </div>

        {/* 购买操作区 */}
        {unitPrice !== undefined ? (
          <div className="market-list-sheet-form">
            <div className="market-list-sheet-row" style={{ justifyContent: 'space-between' }}>
              <span className="market-list-sheet-label">一口价（灵石）</span>
              <span className="market-list-sheet-value" style={{ fontWeight: 800, color: 'var(--warning-color)' }}>{unitPrice.toLocaleString()}</span>
            </div>
            <div className="market-list-sheet-actions" style={{ marginTop: 12 }}>
              <button
                className="market-list-sheet-btn is-primary"
                disabled={!canBuy}
                onClick={onBuy}
              >
                {isMyOwn ? '不可购买自己的上架' : '确认购买'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
};

export default MarketPartnerPreviewSheet;
