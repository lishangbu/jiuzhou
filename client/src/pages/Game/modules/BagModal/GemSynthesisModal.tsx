import { App, Button, Empty, InputNumber, Modal, Segmented, Select, Spin, Tag } from 'antd';
import { formatPercent } from '../../shared/formatAttr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  convertInventoryGem,
  getInventoryGemConvertOptions,
  getInventoryGemSynthesisRecipes,
  synthesizeInventoryGem,
  synthesizeInventoryGemBatch,
  type GemConvertOptionDto,
  type GemSynthesisRecipeDto,
  type GemType,
} from '../../../../services/api';

interface GemSynthesisModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

const gemTypeLabel: Record<GemType, string> = {
  attack: '攻击',
  defense: '防御',
  survival: '生存',
  all: '通用',
};

type SynthesisMode = 'quick' | 'single' | 'convert';

const clampSynthesizeTimes = (value: number, maxValue: number): number => {
  const safeMax = Math.max(1, Math.floor(maxValue || 1));
  if (!Number.isFinite(value)) return 1;
  return Math.min(safeMax, Math.max(1, Math.floor(value)));
};

interface BatchEstimate {
  /** 各等级预估产出/余量，level 升序；最后一项为目标等级产出，其余为中间余量 */
  byLevel: Array<{ level: number; count: number }>;
  /** 预估消耗银两 */
  silver: number;
  /** 预估消耗灵石 */
  spiritStones: number;
}

const EMPTY_ESTIMATE: BatchEstimate = { byLevel: [], silver: 0, spiritStones: 0 };

/**
 * 预估快捷合成的产出数量与消耗
 *
 * 逐级模拟合成链：从1级到目标等级，每一步根据持有材料、货币、成功率计算期望产出，
 * 上一步的产出会累加到下一步的可用材料中。
 *
 * 输入：该系列的配方列表、目标等级、当前钱包
 * 输出：{ byLevel, silver, spiritStones }
 *
 * 边界：
 * - 某一级配方缺失时链条中断，返回全0
 * - 货币不足时会限制合成次数
 */
const estimateBatchOutput = (
  seriesRecipes: GemSynthesisRecipeDto[],
  targetLevel: number,
  wallet: { silver: number; spiritStones: number } | null,
): BatchEstimate => {
  const zero: BatchEstimate = EMPTY_ESTIMATE;
  if (!wallet || seriesRecipes.length === 0 || targetLevel < 2) return zero;

  const recipeByFromLevel = new Map<number, GemSynthesisRecipeDto>();
  for (const recipe of seriesRecipes) {
    if (!recipeByFromLevel.has(recipe.fromLevel)) {
      recipeByFromLevel.set(recipe.fromLevel, recipe);
    }
  }

  let carry = 0;
  let remainingSilver = wallet.silver;
  let remainingSpiritStones = wallet.spiritStones;
  let totalSilver = 0;
  let totalSpiritStones = 0;
  const byLevel: Array<{ level: number; count: number }> = [];

  for (let fromLevel = 1; fromLevel < targetLevel; fromLevel += 1) {
    const recipe = recipeByFromLevel.get(fromLevel);
    if (!recipe) return EMPTY_ESTIMATE;

    const available = recipe.input.owned + carry;
    const maxByGems = recipe.input.qty > 0 ? Math.floor(available / recipe.input.qty) : 0;
    const maxBySilver = recipe.costs.silver > 0 ? Math.floor(remainingSilver / recipe.costs.silver) : maxByGems;
    const maxBySpirit =
      recipe.costs.spiritStones > 0
        ? Math.floor(remainingSpiritStones / recipe.costs.spiritStones)
        : maxByGems;
    const times = Math.max(0, Math.min(maxByGems, maxBySilver, maxBySpirit));

    const consumed = times * recipe.input.qty;
    const remainder = available - consumed;
    if (remainder > 0) {
      byLevel.push({ level: fromLevel, count: remainder });
    }

    const silverCost = times * recipe.costs.silver;
    const spiritCost = times * recipe.costs.spiritStones;
    remainingSilver -= silverCost;
    remainingSpiritStones -= spiritCost;
    totalSilver += silverCost;
    totalSpiritStones += spiritCost;

    carry = Math.floor(times * recipe.successRate) * recipe.output.qty;
    if (carry <= 0) {
      return { byLevel, silver: totalSilver, spiritStones: totalSpiritStones };
    }
  }

  if (carry > 0) {
    byLevel.push({ level: targetLevel, count: carry });
  }

  return { byLevel, silver: totalSilver, spiritStones: totalSpiritStones };
};

/**
 * 从配方列表中提取系列选项
 *
 * 输入：当前宝石类型下的配方列表
 * 输出：[{ value: seriesKey, label: 系列显示名 }]
 */
const buildSeriesOptions = (recipes: GemSynthesisRecipeDto[]) => {
  const map = new Map<string, string>();
  for (const recipe of recipes) {
    if (!map.has(recipe.seriesKey)) {
      const displayName = recipe.output.name.replace(/·\d+级$/, '') || recipe.seriesKey;
      map.set(recipe.seriesKey, displayName);
    }
  }
  return [...map.entries()].map(([value, label]) => ({ value, label }));
};

/**
 * 构建宝石转换等级选项
 *
 * 输入：后端返回的转换选项数组（2~10级）
 * 输出：Select 可用选项（包含可转次数，且不可转等级禁用）
 */
const buildConvertLevelOptions = (options: GemConvertOptionDto[]) => {
  return options
    .slice()
    .sort((a, b) => a.inputLevel - b.inputLevel)
    .map((option) => ({
      value: option.inputLevel,
      label: `${option.inputLevel}级（可转${option.maxConvertTimes}次）`,
      disabled: option.maxConvertTimes <= 0,
    }));
};

const GemSynthesisModal: React.FC<GemSynthesisModalProps> = ({ open, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const [gemType, setGemType] = useState<GemType>('attack');
  const [recipes, setRecipes] = useState<GemSynthesisRecipeDto[]>([]);
  const [convertOptions, setConvertOptions] = useState<GemConvertOptionDto[]>([]);
  const [wallet, setWallet] = useState<{ silver: number; spiritStones: number } | null>(null);
  const [mode, setMode] = useState<SynthesisMode>('quick');

  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [times, setTimes] = useState(1);
  const selectedRecipeIdRef = useRef('');

  const [batchSeriesKey, setBatchSeriesKey] = useState('');
  const [targetLevel, setTargetLevel] = useState(2);
  const targetLevelRef = useRef(2);

  const [convertInputLevel, setConvertInputLevel] = useState(2);
  const [convertTimes, setConvertTimes] = useState(1);
  const convertInputLevelRef = useRef(2);

  useEffect(() => {
    selectedRecipeIdRef.current = selectedRecipeId;
  }, [selectedRecipeId]);

  useEffect(() => {
    targetLevelRef.current = targetLevel;
  }, [targetLevel]);

  useEffect(() => {
    convertInputLevelRef.current = convertInputLevel;
  }, [convertInputLevel]);

  /**
   * 刷新宝石合成与转换数据
   *
   * 数据流：
   * - 并发请求配方与转换选项
   * - 统一更新钱包/合成状态/转换状态
   * - 尽量保留用户已选项（配方、目标等级、转换等级）
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [synthesisRes, convertRes] = await Promise.all([
        getInventoryGemSynthesisRecipes(),
        getInventoryGemConvertOptions(),
      ]);
      if (!synthesisRes.success || !synthesisRes.data) {
        throw new Error(synthesisRes.message || '加载宝石配方失败');
      }
      if (!convertRes.success || !convertRes.data) {
        throw new Error(convertRes.message || '加载宝石转换配置失败');
      }

      const nextRecipes = synthesisRes.data.recipes || [];
      const nextConvertOptions = (convertRes.data.options || []).slice().sort((a, b) => a.inputLevel - b.inputLevel);
      setRecipes(nextRecipes);
      setConvertOptions(nextConvertOptions);
      setWallet(synthesisRes.data.character);

      const sameTypeRecipes = nextRecipes
        .filter((recipe) => recipe.gemType === gemType)
        .sort((a, b) => a.seriesKey.localeCompare(b.seriesKey) || a.fromLevel - b.fromLevel);

      const currentSelectedRecipeId = selectedRecipeIdRef.current;
      const nextSelectedRecipeId = sameTypeRecipes.some((recipe) => recipe.recipeId === currentSelectedRecipeId)
        ? currentSelectedRecipeId
        : sameTypeRecipes[0]?.recipeId || '';
      setSelectedRecipeId(nextSelectedRecipeId);
      const selectedRecipe =
        sameTypeRecipes.find((recipe) => recipe.recipeId === nextSelectedRecipeId) ?? sameTypeRecipes[0] ?? null;
      setTimes(clampSynthesizeTimes(1, selectedRecipe?.maxSynthesizeTimes ?? 1));

      const currentTargetLevel = targetLevelRef.current;
      const allToLevels = [...new Set(sameTypeRecipes.map((recipe) => recipe.toLevel))];
      const maxToLevel = allToLevels.length > 0 ? Math.max(...allToLevels) : 2;
      setTargetLevel(Math.max(2, Math.min(maxToLevel, currentTargetLevel)));

      const currentConvertLevel = convertInputLevelRef.current;
      const nextConvertLevel = nextConvertOptions.some((option) => option.inputLevel === currentConvertLevel)
        ? currentConvertLevel
        : nextConvertOptions[0]?.inputLevel || 2;
      setConvertInputLevel(nextConvertLevel);
      const selectedConvertOption =
        nextConvertOptions.find((option) => option.inputLevel === nextConvertLevel) ?? nextConvertOptions[0] ?? null;
      setConvertTimes(clampSynthesizeTimes(1, selectedConvertOption?.maxConvertTimes ?? 1));
    } catch (error: unknown) {
      void 0;
      setRecipes([]);
      setConvertOptions([]);
      setWallet(null);
      setSelectedRecipeId('');
      setTimes(1);
      setTargetLevel(2);
      setConvertInputLevel(2);
      setConvertTimes(1);
    } finally {
      setLoading(false);
    }
  }, [gemType, message]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const filteredRecipes = useMemo(() => {
    return recipes
      .filter((recipe) => recipe.gemType === gemType)
      .sort((a, b) => a.seriesKey.localeCompare(b.seriesKey) || a.fromLevel - b.fromLevel);
  }, [gemType, recipes]);

  const seriesOptions = useMemo(() => buildSeriesOptions(filteredRecipes), [filteredRecipes]);

  useEffect(() => {
    if (seriesOptions.length === 0) {
      setBatchSeriesKey('');
      return;
    }
    if (!seriesOptions.some((option) => option.value === batchSeriesKey)) {
      setBatchSeriesKey(seriesOptions[0].value);
    }
  }, [batchSeriesKey, seriesOptions]);

  const batchTargetLevelOptions = useMemo(() => {
    if (!batchSeriesKey) return [];
    const seriesRecipes = filteredRecipes.filter((recipe) => recipe.seriesKey === batchSeriesKey);
    const levels = [...new Set(seriesRecipes.map((recipe) => recipe.toLevel))]
      .filter((level) => level > 1)
      .sort((a, b) => a - b);
    return levels.map((level) => ({ value: level, label: `${level}级` }));
  }, [batchSeriesKey, filteredRecipes]);

  useEffect(() => {
    if (batchTargetLevelOptions.length === 0) {
      setTargetLevel(2);
      return;
    }
    if (!batchTargetLevelOptions.some((option) => option.value === targetLevel)) {
      setTargetLevel(batchTargetLevelOptions[0].value);
    }
  }, [targetLevel, batchTargetLevelOptions]);

  const batchEstimate = useMemo((): BatchEstimate => {
    if (!batchSeriesKey) return EMPTY_ESTIMATE;
    const seriesRecipes = filteredRecipes.filter((recipe) => recipe.seriesKey === batchSeriesKey);
    return estimateBatchOutput(seriesRecipes, targetLevel, wallet);
  }, [batchSeriesKey, filteredRecipes, targetLevel, wallet]);

  const selectedRecipe = useMemo(() => {
    if (filteredRecipes.length === 0) return null;
    return filteredRecipes.find((recipe) => recipe.recipeId === selectedRecipeId) ?? filteredRecipes[0];
  }, [filteredRecipes, selectedRecipeId]);

  useEffect(() => {
    if (!selectedRecipe) {
      setTimes(1);
      return;
    }
    setTimes((prev) => clampSynthesizeTimes(prev, selectedRecipe.maxSynthesizeTimes));
  }, [selectedRecipe]);

  const convertLevelOptions = useMemo(() => buildConvertLevelOptions(convertOptions), [convertOptions]);
  const selectedConvertOption = useMemo(() => {
    if (convertOptions.length === 0) return null;
    return convertOptions.find((option) => option.inputLevel === convertInputLevel) ?? convertOptions[0];
  }, [convertInputLevel, convertOptions]);

  useEffect(() => {
    if (!selectedConvertOption) {
      setConvertTimes(1);
      return;
    }
    setConvertTimes((prev) => clampSynthesizeTimes(prev, selectedConvertOption.maxConvertTimes));
  }, [selectedConvertOption]);

  const handleExecute = useCallback(async () => {
    if (!selectedRecipe) return;
    const executeTimes = clampSynthesizeTimes(times, selectedRecipe.maxSynthesizeTimes);
    setSubmitting(true);
    try {
      const res = await synthesizeInventoryGem({ recipeId: selectedRecipe.recipeId, times: executeTimes });
      if (!res.success || !res.data) throw new Error(res.message || '宝石合成失败');
      if (res.data.successCount > 0) {
        message.success(res.message || '宝石合成完成');
      } else {
        message.warning(res.message || '宝石合成失败');
      }
      await onSuccess();
      await refresh();
    } catch (error: unknown) {
      void 0;
    } finally {
      setSubmitting(false);
    }
  }, [message, onSuccess, refresh, selectedRecipe, times]);

  /**
   * 快捷合成：使用独立的 batchSeriesKey + targetLevel
   * 不传 sourceLevel，服务端默认从1级开始逐级合成
   */
  const handleBatch = useCallback(async () => {
    if (!batchSeriesKey) return;
    setBatchSubmitting(true);
    try {
      const res = await synthesizeInventoryGemBatch({
        gemType,
        targetLevel,
        seriesKey: batchSeriesKey,
      });
      if (!res.success || !res.data) throw new Error(res.message || '快捷合成失败');
      const steps = res.data.steps ?? [];
      const successCount = steps.reduce((sum, step) => sum + (step.successCount || 0), 0);
      const failCount = steps.reduce((sum, step) => sum + (step.failCount || 0), 0);
      if (successCount > 0) {
        message.success(`${res.message || '快捷合成成功'}（成功${successCount}次，失败${failCount}次）`);
      } else {
        message.warning(`${res.message || '快捷合成失败'}（失败${failCount}次）`);
      }
      await onSuccess();
      await refresh();
    } catch (error: unknown) {
      void 0;
    } finally {
      setBatchSubmitting(false);
    }
  }, [batchSeriesKey, gemType, message, onSuccess, refresh, targetLevel]);

  const handleConvert = useCallback(async () => {
    if (!selectedConvertOption) return;
    if (selectedConvertOption.maxConvertTimes <= 0) return;

    const executeTimes = clampSynthesizeTimes(convertTimes, selectedConvertOption.maxConvertTimes);
    setConvertSubmitting(true);
    try {
      const res = await convertInventoryGem({
        inputLevel: selectedConvertOption.inputLevel,
        times: executeTimes,
      });
      if (!res.success || !res.data) throw new Error(res.message || '宝石转换失败');

      const producedSummary = (res.data.produced.items || [])
        .map((item) => `${item.name}×${item.qty}`)
        .join('、');
      if (producedSummary) {
        message.success(`${res.message || '宝石转换成功'}：${producedSummary}`);
      } else {
        message.success(res.message || '宝石转换成功');
      }
      await onSuccess();
      await refresh();
    } catch (error: unknown) {
      void 0;
    } finally {
      setConvertSubmitting(false);
    }
  }, [convertTimes, message, onSuccess, refresh, selectedConvertOption]);

  const canSynthesize = !!selectedRecipe && selectedRecipe.maxSynthesizeTimes > 0;
  const canBatch = !!batchSeriesKey && batchTargetLevelOptions.length > 0 && !batchSubmitting;
  const canConvert =
    !!selectedConvertOption &&
    selectedConvertOption.maxConvertTimes > 0 &&
    selectedConvertOption.candidateGemCount > 0 &&
    !convertSubmitting;

  return (
    <Modal
      open={open}
      onCancel={() => {
        if (submitting || batchSubmitting || convertSubmitting) return;
        onClose();
      }}
      footer={null}
      centered
      width={980}
      title="宝石工坊"
      className="bag-gem-modal"
      destroyOnHidden
      maskClosable={!(submitting || batchSubmitting || convertSubmitting)}
    >
      <div className="bag-gem-shell">
        <div className="bag-gem-top">
          <div className="bag-gem-top-left">
            <Segmented
              value={mode}
              options={[
                { label: '快捷合成', value: 'quick' },
                { label: '单次合成', value: 'single' },
                { label: '宝石转换', value: 'convert' },
              ]}
              onChange={(value) => setMode(value as SynthesisMode)}
            />
            {mode !== 'convert' ? (
              <Segmented
                value={gemType}
                options={(Object.keys(gemTypeLabel) as GemType[]).map((type) => ({
                  label: gemTypeLabel[type],
                  value: type,
                }))}
                onChange={(value) => {
                  setGemType(value as GemType);
                  setSelectedRecipeId('');
                  setBatchSeriesKey('');
                }}
              />
            ) : null}
          </div>
          {wallet ? (
            <div className="bag-gem-wallet">
              <Tag color="gold">银两：{wallet.silver.toLocaleString()}</Tag>
              <Tag color="blue">灵石：{wallet.spiritStones.toLocaleString()}</Tag>
            </div>
          ) : null}
        </div>

        {mode === 'quick' ? (
          <div className="bag-gem-quick">
            {loading && recipes.length === 0 ? (
              <div className="bag-gem-loading"><Spin /></div>
            ) : seriesOptions.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用宝石配方" />
            ) : (
              <div className="bag-gem-quick-form">
                <div className="bag-gem-quick-row">
                  <Select
                    value={batchSeriesKey || undefined}
                    options={seriesOptions}
                    onChange={(value) => setBatchSeriesKey(String(value))}
                    placeholder="选择系列"
                    className="bag-gem-quick-series"
                  />
                  <Select
                    value={targetLevel}
                    options={batchTargetLevelOptions}
                    onChange={(value) => setTargetLevel(Number(value) || 2)}
                    placeholder="目标等级"
                    className="bag-gem-quick-target"
                  />
                  <Button
                    type="primary"
                    disabled={!canBatch}
                    loading={batchSubmitting}
                    onClick={() => void handleBatch()}
                  >
                    快捷合成
                  </Button>
                </div>
                {batchSeriesKey && batchTargetLevelOptions.length > 0 ? (
                  <div className="bag-gem-quick-estimate">
                    <span className="bag-gem-quick-estimate-label">预估产出</span>
                    <span className="bag-gem-quick-estimate-levels">
                      {batchEstimate.byLevel.length > 0
                        ? batchEstimate.byLevel.map((item) => (
                            <span key={item.level} className={item.level === targetLevel ? 'is-target' : 'is-remainder'}>
                              {item.level}级×{item.count}
                            </span>
                          ))
                        : <span className="is-empty">无法合成</span>}
                    </span>
                    {batchEstimate.silver > 0 ? (
                      <span>消耗银两 <strong>{batchEstimate.silver.toLocaleString()}</strong></span>
                    ) : null}
                    {batchEstimate.spiritStones > 0 ? (
                      <span>消耗灵石 <strong>{batchEstimate.spiritStones.toLocaleString()}</strong></span>
                    ) : null}
                  </div>
                ) : null}
                <div className="bag-gem-quick-hint">
                  自动使用低级宝石逐级合成到目标等级，6级以上存在失败率。
                </div>
              </div>
            )}
          </div>
        ) : mode === 'single' ? (
          <div className="bag-gem-body">
            {loading && recipes.length === 0 ? (
              <div className="bag-gem-loading"><Spin /></div>
            ) : (
              <>
                <div className="bag-gem-list">
                  {filteredRecipes.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用宝石配方" />
                  ) : (
                    filteredRecipes.map((recipe) => (
                      <button
                        key={recipe.recipeId}
                        type="button"
                        className={`bag-gem-item ${selectedRecipe?.recipeId === recipe.recipeId ? 'is-active' : ''}`}
                        onClick={() => setSelectedRecipeId(recipe.recipeId)}
                      >
                        <div className="bag-gem-item-title">{recipe.name}</div>
                        <div className="bag-gem-item-meta">
                          <span>{recipe.fromLevel}级 → {recipe.toLevel}级</span>
                          <span>成功率 {formatPercent(recipe.successRate)}</span>
                        </div>
                        <div className="bag-gem-item-meta">
                          <span>可合成 {recipe.maxSynthesizeTimes} 次</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="bag-gem-detail">
                  {selectedRecipe ? (
                    <div className="bag-gem-detail-content">
                      <div className="bag-gem-detail-title">{selectedRecipe.name}</div>
                      <div className="bag-gem-detail-meta">
                        <Tag color="default">类型：{gemTypeLabel[selectedRecipe.gemType]}</Tag>
                        <Tag color="blue">产出：{selectedRecipe.output.name} ×{selectedRecipe.output.qty}</Tag>
                        <Tag color={selectedRecipe.successRate >= 1 ? 'green' : 'orange'}>
                          成功率：{formatPercent(selectedRecipe.successRate)}
                        </Tag>
                      </div>

                      <div className="bag-gem-costs">
                        {selectedRecipe.input.qty > 0 ? (
                          <div className={`bag-gem-cost-line ${selectedRecipe.input.owned < selectedRecipe.input.qty ? 'is-missing' : ''}`}>
                            <span>{selectedRecipe.input.name}</span>
                            <span>{selectedRecipe.input.qty} / {selectedRecipe.input.owned}</span>
                          </div>
                        ) : null}
                        {selectedRecipe.costs.silver > 0 ? (
                          <div className={`bag-gem-cost-line ${(wallet?.silver ?? 0) < selectedRecipe.costs.silver ? 'is-missing' : ''}`}>
                            <span>银两</span>
                            <span>{selectedRecipe.costs.silver.toLocaleString()} / {(wallet?.silver ?? 0).toLocaleString()}</span>
                          </div>
                        ) : null}
                        {selectedRecipe.costs.spiritStones > 0 ? (
                          <div className={`bag-gem-cost-line ${(wallet?.spiritStones ?? 0) < selectedRecipe.costs.spiritStones ? 'is-missing' : ''}`}>
                            <span>灵石</span>
                            <span>{selectedRecipe.costs.spiritStones.toLocaleString()} / {(wallet?.spiritStones ?? 0).toLocaleString()}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="bag-gem-submit">
                        <div className="bag-gem-submit-input">
                          <span>合成次数</span>
                          <InputNumber
                            min={1}
                            max={Math.max(1, selectedRecipe.maxSynthesizeTimes)}
                            value={times}
                            onChange={(value) => setTimes(clampSynthesizeTimes(Number(value || 1), selectedRecipe.maxSynthesizeTimes))}
                          />
                          <span>最多 {selectedRecipe.maxSynthesizeTimes}</span>
                        </div>
                        <Button
                          type="primary"
                          disabled={!canSynthesize || submitting}
                          loading={submitting}
                          onClick={() => void handleExecute()}
                        >
                          {canSynthesize ? '执行合成' : '材料或货币不足'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择配方" />
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bag-gem-convert">
            {loading && convertOptions.length === 0 ? (
              <div className="bag-gem-loading"><Spin /></div>
            ) : convertOptions.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用转换配置" />
            ) : (
              <div className="bag-gem-convert-form">
                <div className="bag-gem-convert-row">
                  <Select
                    value={selectedConvertOption?.inputLevel}
                    options={convertLevelOptions}
                    onChange={(value) => setConvertInputLevel(Number(value) || 2)}
                    className="bag-gem-convert-level"
                    placeholder="选择输入等级"
                  />
                  <div className="bag-gem-convert-times">
                    <span>转换次数</span>
                    <InputNumber
                      min={1}
                      max={Math.max(1, selectedConvertOption?.maxConvertTimes ?? 1)}
                      value={convertTimes}
                      onChange={(value) =>
                        setConvertTimes(clampSynthesizeTimes(Number(value || 1), selectedConvertOption?.maxConvertTimes ?? 1))
                      }
                    />
                    <span>最多 {selectedConvertOption?.maxConvertTimes ?? 0}</span>
                  </div>
                  <Button
                    type="primary"
                    disabled={!canConvert}
                    loading={convertSubmitting}
                    onClick={() => void handleConvert()}
                  >
                    执行转换
                  </Button>
                </div>

                {selectedConvertOption ? (
                  <>
                    <div className="bag-gem-convert-formula">
                      {selectedConvertOption.inputGemQtyPerConvert}颗{selectedConvertOption.inputLevel}级任意宝石
                      {' -> '}
                      1颗{selectedConvertOption.outputLevel}级随机宝石
                    </div>
                    <div className="bag-gem-convert-summary">
                      <span>当前持有 <strong>{selectedConvertOption.ownedInputGemQty}</strong></span>
                      <span>单次消耗灵石 <strong>{selectedConvertOption.costSpiritStonesPerConvert.toLocaleString()}</strong></span>
                      <span>随机池数量 <strong>{selectedConvertOption.candidateGemCount}</strong></span>
                      <span>最大可转换 <strong>{selectedConvertOption.maxConvertTimes}</strong> 次</span>
                    </div>
                  </>
                ) : null}

                <div className="bag-gem-convert-hint">
                  仅消耗背包内未锁定宝石，转换结果为目标等级全宝石等概率随机。
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default GemSynthesisModal;
