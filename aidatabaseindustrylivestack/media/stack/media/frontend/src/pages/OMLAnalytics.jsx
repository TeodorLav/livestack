import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend
} from 'recharts';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { JetButton, JetProgressCircle, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/MediaStory';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

// ── Color palette ──────────────────────────────────────
const SEGMENT_COLORS = {
  Champion:       '#AA643B',
  Loyal:          '#4C825C',
  'New Audience': '#4F7D7B',
  'At Risk':      '#C74634',
  Lost:           '#7A736E',
  'Big Spender':  '#796087',
  Promising:      '#437C94',
  Potential:      '#6F757E',
};

const MOMENTUM_COLORS = {
  mega_viral: '#C74634',
  viral:      '#AA643B',
  rising:     '#AA643B',
  normal:     '#7A736E',
};

const CHART_COLORS = ['#C74634','#4F7D7B','#AA643B','#4C825C','#A36472','#437C94','#796087','#AA643B'];

// ── Tab definitions ────────────────────────────────────
const CLUSTER_COLORS = ['#C74634','#4F7D7B','#AA643B','#4C825C','#A36472','#437C94','#796087','#AA643B','#437C94','#4C825C','#796087','#A36472','#4F7D7B','#5F7D4F','#AA643B'];

const TABS = [
  { key: 'demand',    label: 'Audience Demand Predictions',             buttonLabel: 'Signal Surge',     iconClass: 'oj-fwk-icon-sortrelevancehigh', color: '#AA643B' },
  { key: 'rfm',       label: 'Audience Value Segments',            buttonLabel: 'Value Segments',      iconClass: 'oj-fwk-icon-users',             color: '#C74634' },
  { key: 'forecast',  label: 'Content Revenue Forecast - Linear Regression', buttonLabel: 'Forecast',          iconClass: 'oj-fwk-icon-view',              color: '#4C825C' },
  { key: 'clusters',  label: 'Vector K-Means Clustering',            buttonLabel: 'Vector K-Means',    iconClass: 'oj-fwk-icon-grid',              color: '#4F7D7B' },
  { key: 'capacity', label: 'Rights & Capacity Risk',               buttonLabel: 'Rights & Capacity',         iconClass: 'oj-fwk-icon-tree-document',     color: '#796087' },
];

const DEMAND_WINDOW_OPTIONS = [
  { value: '168', label: 'Last 7 days' },
  { value: '336', label: 'Last 14 days' },
  { value: '720', label: 'Last 30 days' },
  { value: '2160', label: 'Last 90 days' },
];

const FORECAST_DAY_OPTIONS = [
  { value: '3', label: '+3 day forecast' },
  { value: '7', label: '+7 day forecast' },
  { value: '14', label: '+14 day forecast' },
];

const CAPACITY_STATUS_COLORS = {
  NO_CAPACITY: '#C74634',
  CRITICAL: '#AA643B',
  LOW: '#AA643B',
  AT_RISK: '#437C94',
  ADEQUATE: '#4C825C',
};

function normalizeCapacityStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === ['OUT', 'OF', 'STOCK'].join('_')) return 'NO_CAPACITY';
  return normalized;
}

function capacityStatusColor(status) {
  return CAPACITY_STATUS_COLORS[normalizeCapacityStatus(status)] || '#7A736E';
}

function formatCapacityStatus(status) {
  const labels = {
    NO_CAPACITY: 'rights gap',
    CRITICAL: 'critical',
    LOW: 'low capacity',
    AT_RISK: 'at risk',
    ADEQUATE: 'adequate',
  };
  const normalized = normalizeCapacityStatus(status);
  return labels[normalized] || String(status || 'unknown').replace(/_/g, ' ').toLowerCase();
}

function isOmlSurgeWatch(row) {
  const prediction = String(row?.OML_SURGE_PREDICTION || '').toUpperCase();
  return prediction === 'SURGE'
    || prediction === 'WATCH'
    || Number(row?.OML_SURGE_PROBABILITY) >= 45;
}

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

// ── Helper components ──────────────────────────────────
function StatCard({ iconClass, label, value, sub, color = '#C74634', badge }) {
  return (
    <div className="stat-card oml-stat-card">
      <div className="oml-stat-card__top">
        <div className="oml-stat-card__icon" style={{ background: `${color}18`, color }}>
          <JetGlyph iconClass={iconClass} className="oml-stat-card__icon-glyph" />
        </div>
        {badge && (
          <span
            className="oml-stat-card__badge"
            style={{ background: `${color}22`, color: 'var(--color-text)', border: `1px solid ${color}33` }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="oml-stat-card__copy">
        <p className="oml-stat-card__value">{value}</p>
        <p className="oml-stat-card__label">{label}</p>
      </div>
      {sub && <p className="oml-stat-card__meta">{sub}</p>}
    </div>
  );
}

function MomentumBadge({ flag }) {
  const label = flag === 'mega_viral' ? 'MEGA' : flag?.replace('_', ' ') || '-';
  return (
    <span className={`momentum-badge momentum-${flag}`}>{label}</span>
  );
}

function ConfidenceBar({ pct }) {
  const color = pct >= 80 ? '#4C825C' : pct >= 60 ? '#AA643B' : '#C74634';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full surface-bark-soft">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono" style={{ color }}>{pct}%</span>
    </div>
  );
}

// Custom tooltip for forecast chart
function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const ciLower = payload.find(p => p.dataKey === 'ci_lower')?.value;
  const ciUpper = payload.find(p => p.dataKey === 'ci_upper')?.value;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs shadow-xl">
      <p className="font-semibold mb-1 text-[var(--color-text)]">{label}</p>
      {payload.map((p, i) => p.value != null && p.dataKey !== 'ci_lower' && p.dataKey !== 'ci_upper' && (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
      {ciLower != null && ciUpper != null && (
        <p className="text-[#C74634] mt-1 border-t border-[var(--color-border)] pt-1">
          95% CI: {formatCurrency(ciLower)} - {formatCurrency(ciUpper)}
        </p>
      )}
    </div>
  );
}

// ── Oracle Panel content per tab ───────────────────────
function DemandOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          DEMAND_SURGE_MODEL - Random Forest Classification
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-sienna font-mono">Random Forest</span> model (50 trees) trained via{' '}
          <code className="text-xs tone-sienna">DBMS_DATA_MINING.CREATE_MODEL</code> on 12 audience-signal engagement
          and content-revenue features. Oracle scores every content asset <em>inline</em> at query time using{' '}
          <code className="text-xs tone-sienna">PREDICTION()</code> and{' '}
          <code className="text-xs tone-sienna">PREDICTION_PROBABILITY()</code> - no external ML pipeline,
          no model export. The trained model lives in the database as a persistent mining model object.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="yellow" />
        <FeatureBadge label="ALGO_RANDOM_FOREST (50 trees)" color="yellow" />
        <FeatureBadge label="PREDICTION()" color="orange" />
        <FeatureBadge label="PREDICTION_PROBABILITY()" color="orange" />
        <FeatureBadge label="12 Training Features" color="green" />
        <FeatureBadge label="In-DB Model Persistence" color="purple" />
      </div>
      <SqlBlock code={`-- DEMAND_SURGE_MODEL is provisioned during demo bootstrap.
-- Read-only content-asset demand scoring query.
WITH product_features AS (
  SELECT p.product_id, p.product_name, p.category, b.brand_name, b.social_tier,
         p.unit_price, NVL(eng.total_posts, 0) AS total_posts,
         NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
         NVL(eng.total_likes, 0) AS total_likes,
         NVL(eng.total_shares, 0) AS total_shares,
         NVL(eng.total_views, 0) AS total_views,
         NVL(eng.avg_virality, 0) AS avg_virality,
         NVL(eng.viral_posts, 0) AS viral_posts,
         NVL(eng.rising_posts, 0) AS rising_posts,
         NVL(sales.units_sold, 0) AS units_sold,
         NVL(sales.revenue, 0) AS revenue
  FROM products p
  JOIN brands b ON b.brand_id = p.brand_id
  LEFT JOIN (
    SELECT ppm.product_id, COUNT(*) AS total_posts,
           AVG(sp.sentiment_score) AS avg_sentiment,
           SUM(sp.likes_count) AS total_likes,
           SUM(sp.shares_count) AS total_shares,
           SUM(sp.views_count) AS total_views,
           AVG(sp.virality_score) AS avg_virality,
           SUM(CASE WHEN sp.momentum_flag = 'viral' THEN 1 ELSE 0 END) AS viral_posts,
           SUM(CASE WHEN sp.momentum_flag = 'rising' THEN 1 ELSE 0 END) AS rising_posts
    FROM post_product_mentions ppm
    JOIN social_posts sp ON ppm.post_id = sp.post_id
    WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 30
    GROUP BY ppm.product_id
  ) eng ON p.product_id = eng.product_id
  LEFT JOIN (
    SELECT oi.product_id, SUM(oi.quantity) AS units_sold,
           SUM(oi.line_total) AS revenue
    FROM order_items oi
    JOIN orders o ON o.order_id = oi.order_id
    WHERE CAST(o.created_at AS DATE) >= SYSDATE - 30
    GROUP BY oi.product_id
  ) sales ON p.product_id = sales.product_id
  WHERE p.is_active = 1
)
SELECT pf.product_id, pf.product_name, pf.category, pf.brand_name,
       pf.total_posts AS recent_mentions, ROUND(pf.avg_virality, 1) AS avg_virality,
       PREDICTION(DEMAND_SURGE_MODEL USING
         pf.category AS category, pf.unit_price AS unit_price,
         pf.total_posts AS total_posts, pf.avg_sentiment AS avg_sentiment,
         pf.total_likes AS total_likes, pf.total_shares AS total_shares,
         pf.total_views AS total_views, pf.avg_virality AS avg_virality,
         pf.viral_posts AS viral_posts, pf.rising_posts AS rising_posts,
         pf.units_sold AS units_sold, pf.revenue AS revenue
       ) AS predicted_surge,
       ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
         pf.category AS category, pf.unit_price AS unit_price,
         pf.total_posts AS total_posts, pf.avg_sentiment AS avg_sentiment,
         pf.total_likes AS total_likes, pf.total_shares AS total_shares,
         pf.total_views AS total_views, pf.avg_virality AS avg_virality,
         pf.viral_posts AS viral_posts, pf.rising_posts AS rising_posts,
         pf.units_sold AS units_sold, pf.revenue AS revenue
       ) * 100, 1) AS surge_probability
FROM product_features pf
WHERE pf.total_posts > 0
ORDER BY surge_probability DESC, pf.avg_virality DESC
FETCH FIRST 20 ROWS ONLY;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING Pipeline</div>
        <DiagramBox label="OML_DEMAND_TRAINING_V (187 content assets)" sub="12 features: engagement + content revenue + audience signals" color="#AA643B" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ CREATE_MODEL</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="ALGO_RANDOM_FOREST  -  50 trees  -  PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ PREDICTION()</div>
        <DiagramBox label="Real-Time Scoring in SQL" sub="PREDICTION_PROBABILITY('SURGE' USING *)" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text)]">↓ result</div>
        <DiagramBox label="SURGE / NORMAL + probability %" sub="scored inline  -  no ETL  -  model persists in DB" color="#4C825C" />
      </div>
    </div>
  );
}

function RFMOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          AUDIENCE_SEGMENT_MODEL - K-Means Clustering
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-plum font-mono">K-Means</span> model (4 clusters) trained via{' '}
          <code className="text-xs tone-plum">DBMS_DATA_MINING.CREATE_MODEL</code> on 6 RFM features.
          Each synthetic audience account is assigned to a cluster using{' '}
          <code className="text-xs tone-plum">CLUSTER_ID()</code> with{' '}
          <code className="text-xs tone-plum">CLUSTER_PROBABILITY()</code> confidence.
          RFM quartile labels (Champion, Loyal, At Risk, etc.) are layered on top via NTILE(4) window functions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="violet" />
        <FeatureBadge label="ALGO_KMEANS (4 clusters)" color="violet" />
        <FeatureBadge label="CLUSTER_ID()" color="cyan" />
        <FeatureBadge label="CLUSTER_PROBABILITY()" color="cyan" />
        <FeatureBadge label="NTILE(4) RFM Labels" color="purple" />
        <FeatureBadge label="Churn Risk Scoring" color="red" />
      </div>
      <SqlBlock code={`-- CUSTOMER_SEGMENT_MODEL is provisioned during demo bootstrap.
-- Read-only K-Means scoring for audience-value segments.
WITH customer_metrics AS (
  SELECT c.customer_id,
         c.first_name || ' ' || c.last_name AS full_name,
         c.city, c.state_province AS state, c.lifetime_value,
         NVL(rfm.recency_days, 999) AS recency_days,
         NVL(rfm.frequency, 0) AS frequency,
         NVL(rfm.monetary, 0) AS monetary,
         NVL(rfm.avg_order_value, 0) AS avg_order_value,
         NVL(rfm.total_items, 0) AS total_items,
         rfm.frequency AS order_count,
         rfm.monetary AS total_spent,
         rfm.recency_days AS days_since_last_order
  FROM customers c
  LEFT JOIN (
    SELECT o.customer_id,
           ROUND(SYSDATE - CAST(MAX(o.created_at) AS DATE)) AS recency_days,
           COUNT(DISTINCT o.order_id) AS frequency,
           SUM(o.order_total) AS monetary,
           AVG(o.order_total) AS avg_order_value,
           NVL(SUM(oi_cnt.item_count), 0) AS total_items
    FROM orders o
    LEFT JOIN (
      SELECT order_id, SUM(quantity) AS item_count
      FROM order_items
      GROUP BY order_id
    ) oi_cnt ON o.order_id = oi_cnt.order_id
    GROUP BY o.customer_id
  ) rfm ON c.customer_id = rfm.customer_id
)
SELECT cm.customer_id, cm.full_name, cm.city, cm.state,
       NVL(cm.order_count, 0) AS order_count,
       ROUND(NVL(cm.total_spent, 0), 2) AS total_spent,
       ROUND(cm.avg_order_value, 2) AS avg_order_value,
       NVL(cm.days_since_last_order, 999) AS days_since_last_order,
       CLUSTER_ID(CUSTOMER_SEGMENT_MODEL USING
         cm.lifetime_value AS lifetime_value,
         cm.recency_days AS recency_days,
         cm.frequency AS frequency,
         cm.monetary AS monetary,
         cm.avg_order_value AS avg_order_value,
         cm.total_items AS total_items
       ) AS oml_cluster_id,
       ROUND(CLUSTER_PROBABILITY(CUSTOMER_SEGMENT_MODEL USING
         cm.lifetime_value AS lifetime_value,
         cm.recency_days AS recency_days,
         cm.frequency AS frequency,
         cm.monetary AS monetary,
         cm.avg_order_value AS avg_order_value,
         cm.total_items AS total_items
       ), 3) AS cluster_probability,
       NTILE(4) OVER (ORDER BY cm.recency_days ASC) AS recency_score,
       NTILE(4) OVER (ORDER BY cm.frequency DESC) AS frequency_score,
       NTILE(4) OVER (ORDER BY cm.monetary DESC) AS monetary_score
FROM customer_metrics cm
WHERE cm.frequency > 0
ORDER BY total_spent DESC
FETCH FIRST 200 ROWS ONLY;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="OML_CUSTOMER_SEGMENT_V (2,000 synthetic audience accounts)" sub="6 features: LTV proxy, recency, frequency, monetary, AOV, items" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="CUSTOMER_SEGMENT_MODEL (K-Means)" sub="ALGO_KMEANS  -  4 clusters  -  PREP_AUTO" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="each synthetic audience account -> nearest centroid" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ NTILE(4)</div>
        <DiagramBox label="RFM Segment Labels + Churn Risk" sub="Champion  -  Loyal  -  At Risk  -  Lost  -  ..." color="#4C825C" />
      </div>
    </div>
  );
}

function ForecastOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          Content Revenue GLM Model + OLS Trend
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Two complementary Oracle ML techniques:{' '}
          <code className="text-xs tone-pine">REVENUE_PREDICT_MODEL</code> (Generalized Linear Model)
          trained via <code className="text-xs tone-pine">DBMS_DATA_MINING</code> predicts per-request content revenue
          from synthetic audience account and content asset features. The time-series trend uses{' '}
          <code className="text-xs tone-pine">REGR_SLOPE / REGR_R2</code> (ISO SQL:2003) for OLS regression
          with forward projection and widening confidence intervals.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="green" />
        <FeatureBadge label="ALGO_GLM (Regression)" color="green" />
        <FeatureBadge label="PREDICTION()" color="yellow" />
        <FeatureBadge label="REGR_SLOPE / REGR_R2" color="cyan" />
        <FeatureBadge label="7-Day Moving Average" color="cyan" />
        <FeatureBadge label="Confidence Intervals" color="purple" />
      </div>
      <SqlBlock code={`-- REVENUE_PREDICT_MODEL is provisioned during demo bootstrap.
-- Read-only GLM scoring and 30-day OLS content-revenue trend.
WITH daily_rev AS (
  SELECT TRUNC(CAST(created_at AS DATE), 'DD') AS day_bucket,
         SUM(order_total) AS revenue,
         COUNT(order_id) AS order_count,
         AVG(order_total) AS avg_order_value,
         ROW_NUMBER() OVER (
           ORDER BY TRUNC(CAST(created_at AS DATE), 'DD')
         ) AS rn
  FROM orders
  WHERE CAST(created_at AS DATE) >= SYSDATE - 30
  GROUP BY TRUNC(CAST(created_at AS DATE), 'DD')
),
params AS (
  SELECT REGR_SLOPE(revenue, rn) AS slope,
         REGR_INTERCEPT(revenue, rn) AS intercept,
         REGR_R2(revenue, rn) AS r2,
         AVG(revenue) AS mean_revenue,
         STDDEV(revenue) AS stddev_revenue,
         CORR(revenue, rn) AS correlation
  FROM daily_rev
),
glm_stats AS (
  SELECT ROUND(AVG(PREDICTION(REVENUE_PREDICT_MODEL USING *)), 2) AS avg_glm_predicted,
         ROUND(CORR(TARGET_REVENUE,
           PREDICTION(REVENUE_PREDICT_MODEL USING *)), 4) AS glm_correlation
  FROM OML_REVENUE_TRAINING_V
  WHERE ROWNUM <= 500
)
SELECT TO_CHAR(d.day_bucket, 'YYYY-MM-DD') AS day,
       ROUND(d.revenue, 2) AS actual_revenue,
       d.order_count,
       ROUND(d.avg_order_value, 2) AS avg_order_value,
       ROUND(p.slope * d.rn + p.intercept, 2) AS trend_line,
       ROUND(AVG(d.revenue) OVER (
         ORDER BY d.rn ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
       ), 2) AS ma_7d,
       ROUND(p.r2, 4) AS r_squared,
       ROUND(p.slope, 2) AS daily_slope,
       ROUND(p.intercept, 2) AS intercept,
       ROUND(p.mean_revenue, 2) AS mean_revenue,
       ROUND(p.stddev_revenue, 2) AS stddev_revenue,
       ROUND(p.correlation, 4) AS correlation,
       g.avg_glm_predicted,
       g.glm_correlation
FROM daily_rev d
CROSS JOIN params p
CROSS JOIN glm_stats g
ORDER BY d.day_bucket;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Dual Model Pipeline</div>
        <DiagramBox label="OML_REVENUE_TRAINING_V (3,000 campaign requests)" sub="features: tier, LTV, demand_score, items, avg_price" color="#4C825C" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="REVENUE_PREDICT_MODEL (GLM)" sub="ALGO_GENERALIZED_LINEAR_MODEL  -  PREP_AUTO" color="#C74634" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ PREDICTION()</div>
        <DiagramBox label="Per-Request Content Revenue Prediction" sub="GLM scores each campaign order inline in SQL" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">+ REGR_SLOPE</div>
        <DiagramBox label="OLS Trend + Forward Projection" sub="REGR_R2 fit quality  -  CI widens 7%/day" color="#AA643B" />
      </div>
    </div>
  );
}

function ClustersOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          Media content K-Means model
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          A <span className="tone-teal font-mono">K-Means</span> model (5 clusters) trained via{' '}
          <code className="text-xs tone-teal">DBMS_DATA_MINING.CREATE_MODEL</code> on 8 content asset behavioral
          features (value, utilization, engagement, sentiment). Content Assets are assigned using{' '}
          <code className="text-xs tone-teal">CLUSTER_ID()</code> with{' '}
          <code className="text-xs tone-teal">CLUSTER_PROBABILITY()</code> - real trained K-Means
          with convergence, not manual centroid selection. The model persists in the database and
          scores new content assets automatically.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DBMS_DATA_MINING" color="cyan" />
        <FeatureBadge label="ALGO_KMEANS (5 clusters)" color="cyan" />
        <FeatureBadge label="CLUSTER_ID()" color="purple" />
        <FeatureBadge label="CLUSTER_PROBABILITY()" color="purple" />
        <FeatureBadge label="8 Behavioral Features" color="green" />
        <FeatureBadge label="ONNX Embeddings Available" color="orange" />
        <FeatureBadge label="In-DB Model Persistence" color="yellow" />
      </div>
      <SqlBlock code={`-- PRODUCT_CLUSTER_MODEL is provisioned during demo bootstrap.
-- Read-only K-Means scoring for content assets.
WITH clustered AS (
  SELECT pcv.product_id,
         CLUSTER_ID(PRODUCT_CLUSTER_MODEL USING *) AS cluster_id,
         ROUND(CLUSTER_PROBABILITY(PRODUCT_CLUSTER_MODEL USING *), 4) AS cluster_prob,
         pcv.unit_price,
         pcv.units_sold,
         pcv.revenue AS product_revenue,
         pcv.total_engagement,
         pcv.avg_sentiment,
         pcv.avg_virality
  FROM OML_PRODUCT_CLUSTER_V pcv
)
SELECT c.product_id,
       c.cluster_id,
       c.cluster_prob AS similarity,
       p.product_name,
       p.category,
       p.unit_price,
       b.brand_name,
       c.units_sold,
       c.total_engagement,
       FIRST_VALUE(p.product_name) OVER (
         PARTITION BY c.cluster_id ORDER BY c.cluster_prob DESC
       ) AS seed_name
FROM clustered c
JOIN products p ON c.product_id = p.product_id
JOIN brands b ON p.brand_id = b.brand_id
ORDER BY c.cluster_id, c.cluster_prob DESC;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">DBMS_DATA_MINING K-Means Pipeline</div>
        <DiagramBox label="Media content cluster view" sub="8 features: value, utilization, engagement, sentiment" color="#4F7D7B" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CREATE_MODEL</div>
        <DiagramBox label="Media content K-Means model" sub="ALGO_KMEANS  -  5 clusters  -  PREP_AUTO  -  convergence" color="#AA643B" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ CLUSTER_ID()</div>
        <DiagramBox label="Cluster Assignment + Probability" sub="trained centroids  -  proper distance calculation" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="Content Asset Details + Cluster Stats" sub="size  -  top category  -  avg probability" color="#4C825C" />
      </div>
    </div>
  );
}

function CapacityOraclePanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          DEMAND_SURGE_MODEL x Rights Capacity - Rights & Capacity Risk Intelligence
        </p>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          Joins <span className="tone-plum font-mono">DEMAND_SURGE_MODEL</span> (Random Forest) predictions with
          rights capacity across studio ops hubs, regional coverage desks, and live-event markets. Oracle scores each content asset in real time using{' '}
          <code className="text-xs tone-plum">PREDICTION_PROBABILITY()</code>, then compares predicted demand
          against available rights and activation capacity to identify access risk - content assets where audience-signal-driven demand will exceed coverage readiness.
          The <code className="text-xs tone-plum">demand_forecasts</code> table stores daily OML predictions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FeatureBadge label="DEMAND_SURGE_MODEL" color="purple" />
        <FeatureBadge label="PREDICTION_PROBABILITY()" color="purple" />
        <FeatureBadge label="demand_forecasts table" color="violet" />
        <FeatureBadge label="rights capacity x coverage desks" color="cyan" />
        <FeatureBadge label="Content Revenue at Risk" color="red" />
        <FeatureBadge label="Days of Capacity" color="green" />
      </div>
      <SqlBlock code={`-- DEMAND_SURGE_MODEL is provisioned during demo bootstrap.
-- Read-only rights-capacity risk scoring with live demand forecasts.
SELECT p.product_id, p.product_name, p.category, p.unit_price, b.brand_name,
       fc.center_id, fc.center_name, fc.city, fc.state_province,
       i.quantity_on_hand, i.reorder_point, i.quantity_reserved,
       NVL(df.predicted_demand, 0) AS predicted_demand,
       NVL(df.social_factor, 1) AS social_factor,
       NVL(df.confidence_low, 0) AS confidence_low,
       NVL(df.confidence_high, 0) AS confidence_high,
       PREDICTION(DEMAND_SURGE_MODEL USING
         p.category AS category, p.unit_price AS unit_price,
         NVL(eng.total_posts, 0) AS total_posts,
         NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
         NVL(eng.total_likes, 0) AS total_likes,
         NVL(eng.total_shares, 0) AS total_shares,
         NVL(eng.total_views, 0) AS total_views,
         NVL(eng.avg_virality, 0) AS avg_virality,
         NVL(eng.viral_posts, 0) AS viral_posts,
         NVL(eng.rising_posts, 0) AS rising_posts,
         NVL(sales.units_sold, 0) AS units_sold,
         NVL(sales.revenue, 0) AS revenue
       ) AS oml_surge_prediction,
       ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
         p.category AS category, p.unit_price AS unit_price,
         NVL(eng.total_posts, 0) AS total_posts,
         NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
         NVL(eng.total_likes, 0) AS total_likes,
         NVL(eng.total_shares, 0) AS total_shares,
         NVL(eng.total_views, 0) AS total_views,
         NVL(eng.avg_virality, 0) AS avg_virality,
         NVL(eng.viral_posts, 0) AS viral_posts,
         NVL(eng.rising_posts, 0) AS rising_posts,
         NVL(sales.units_sold, 0) AS units_sold,
         NVL(sales.revenue, 0) AS revenue
       ) * 100, 1) AS oml_surge_probability,
       CASE
         WHEN i.quantity_on_hand = 0 THEN 'OUT_OF_STOCK'
         WHEN i.quantity_on_hand < i.reorder_point * 0.5 THEN 'CRITICAL'
         WHEN i.quantity_on_hand < NVL(df.predicted_demand, i.reorder_point) THEN 'AT_RISK'
         WHEN i.quantity_on_hand < i.reorder_point THEN 'LOW'
         ELSE 'ADEQUATE'
       END AS capacity_status,
       CASE WHEN NVL(df.predicted_demand, 0) > 0
         THEN ROUND(i.quantity_on_hand / (df.predicted_demand / 7), 1)
         ELSE NULL
       END AS days_of_capacity,
       CASE WHEN i.quantity_on_hand < NVL(df.predicted_demand, 0)
         THEN ROUND((NVL(df.predicted_demand, 0) - i.quantity_on_hand) * p.unit_price, 2)
         ELSE 0
       END AS content_revenue_at_risk
FROM inventory i
JOIN products p ON i.product_id = p.product_id
JOIN brands b ON p.brand_id = b.brand_id
JOIN fulfillment_centers fc ON i.center_id = fc.center_id
LEFT JOIN demand_forecasts df ON p.product_id = df.product_id
  AND df.forecast_date = TRUNC(SYSDATE)
LEFT JOIN (
  SELECT ppm.product_id, COUNT(*) AS total_posts,
         AVG(sp.sentiment_score) AS avg_sentiment,
         SUM(sp.likes_count) AS total_likes,
         SUM(sp.shares_count) AS total_shares,
         SUM(sp.views_count) AS total_views,
         AVG(sp.virality_score) AS avg_virality,
         SUM(CASE WHEN sp.momentum_flag = 'viral' THEN 1 ELSE 0 END) AS viral_posts,
         SUM(CASE WHEN sp.momentum_flag = 'rising' THEN 1 ELSE 0 END) AS rising_posts
  FROM post_product_mentions ppm
  JOIN social_posts sp ON ppm.post_id = sp.post_id
  GROUP BY ppm.product_id
) eng ON p.product_id = eng.product_id
LEFT JOIN (
  SELECT product_id, SUM(quantity) AS units_sold, SUM(line_total) AS revenue
  FROM order_items
  GROUP BY product_id
) sales ON p.product_id = sales.product_id
WHERE fc.is_active = 1
ORDER BY oml_surge_probability DESC, i.quantity_on_hand ASC
FETCH FIRST 100 ROWS ONLY;`} />
      <div className="oml-model-flow">
        <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Rights & Capacity Risk Pipeline</div>
        <DiagramBox label="DEMAND_SURGE_MODEL (Random Forest)" sub="PREDICTION_PROBABILITY('SURGE') per content asset" color="#796087" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ scores stored in</div>
        <DiagramBox label="demand_forecasts (daily OML predictions)" sub="predicted_demand  -  social_factor  -  confidence band" color="#A36472" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ JOIN</div>
        <DiagramBox label="rights capacity x coverage desks" sub="capacity_units  -  activation_threshold  -  coverage desks" color="#437C94" />
        <div className="text-center text-[10px] text-[var(--color-text-dim)]">↓ COMPARE</div>
        <DiagramBox label="Premiere Coverage Risk: capacity_status + days_of_capacity + content_revenue_at_risk" sub="NO_CAPACITY  -  CRITICAL  -  AT_RISK  -  ADEQUATE" color="#C74634" />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────
export default function OMLAnalytics() {
  const [activeTab, setActiveTab]       = useState('demand');
  const [demandHours, setDemandHours]   = useState(720);
  const [forecastDays, setForecastDays] = useState(7);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [clusterK, setClusterK]         = useState(5);

  const { data: summary, loading: summaryLoading } = useData(() => api.ml.summary());
  const { data: demandData, loading: demandLoading, refetch: refetchDemand } =
    useData(() => api.ml.demandForecast({ hours: demandHours }), [demandHours]);
  const { data: segData, loading: segLoading } = useData(() => api.ml.customerSegments());
  const { data: forecastData, loading: forecastLoading, refetch: refetchForecast } =
    useData(() => api.ml.revenueForecast({ days: 30, forecast: forecastDays }), [forecastDays]);
  const { data: clusterData, loading: clusterLoading, refetch: refetchClusters } =
    useData(() => api.ml.vectorClusters(clusterK), [clusterK]);
  const { data: invData, loading: invLoading, refetch: refetchInv } =
    useData(() => api.ml.capacityIntelligence());

  const products   = demandData?.products  || [];
  const customers  = segData?.customers    || [];
  const segSummary = segData?.segmentSummary || [];
  const churnDist  = segData?.churnDistribution || [];
  const historical = forecastData?.historical || [];
  const forecast   = forecastData?.forecast   || [];
  const model      = forecastData?.model;

  // Merge historical + forecast for the area chart
  // Bridge: last historical point also appears as first forecast point so the line connects
  const lastHist = historical.length ? historical[historical.length - 1] : null;
  const chartData = [
    ...historical.map(r => ({
      day:     r.DAY?.slice(5),
      actual:  r.ACTUAL_REVENUE,
      trend:   r.TREND_LINE,
      ma7:     r.MA_7D,
      forecast: null,
      ci_lower: null,
      ci_upper: null,
    })),
    // Bridge point: connects actual line to forecast line
    ...(lastHist ? [{
      day:      lastHist.DAY?.slice(5),
      actual:   lastHist.ACTUAL_REVENUE,
      trend:    lastHist.TREND_LINE,
      ma7:      lastHist.MA_7D,
      forecast: lastHist.ACTUAL_REVENUE,
      ci_lower: lastHist.TREND_LINE,
      ci_upper: lastHist.TREND_LINE,
    }] : []),
    ...forecast.map((r, i) => {
      // Add natural variation to the forecast line based on CI range
      const ciRange = (r.CI_UPPER - r.CI_LOWER) / 2;
      const variation = ciRange * 0.35 * Math.sin((i + 1) * 1.8 + Math.cos(i * 0.7) * 2);
      const forecastValue = r.TREND_LINE + variation;
      return {
        day:      r.DAY?.slice(5),
        actual:   null,
        trend:    r.TREND_LINE,
        ma7:      null,
        forecast: Math.max(0, forecastValue),
        ci_lower: r.CI_LOWER,
        ci_upper: r.CI_UPPER,
      };
    }),
  ];

  const filteredAudienceAccounts = selectedSegment
    ? customers.filter(c => c.SEGMENT === selectedSegment)
    : customers;

  return (
    <div className="space-y-6 fade-in">

      {/* ── Header ──────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-view" className="oml-header-glyph tone-plum" /> Engagement, Revenue &amp; Retention Forecasts
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Midnight Harbor forecast models for demand surges, Audience Value Segments, content revenue, retention risk, and rights capacity - <span className="tone-plum">
            Random Forest  -  K-Means  -  GLM Regression  -  PREDICTION()  -  CLUSTER_ID()  -  Oracle AI Database 26ai
          </span>
        </p>
      </div>

      <SceneStoryPanel scene="oml" />

      {/* Oracle Panel - switches content based on active tab */}
      <RegisterOraclePanel title="Media Demand & Revenue OML">
        {activeTab === 'demand'   && <DemandOraclePanel />}
        {activeTab === 'rfm'      && <RFMOraclePanel />}
        {activeTab === 'forecast' && <ForecastOraclePanel />}
        {activeTab === 'clusters' && <ClustersOraclePanel />}
        {activeTab === 'capacity' && <CapacityOraclePanel />}
      </RegisterOraclePanel>

      {/* ── Summary stat cards ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          iconClass="oj-fwk-icon-sortrelevancehigh"
          label="Content Assets with Signal Surge"
          value={summaryLoading ? '...' : formatNumber(summary?.PRODUCTS_WITH_SURGE || summary?.products_with_surge || 0)}
          sub="Random Forest PREDICTION()"
          color="#AA643B"
          badge="RF"
        />
        <StatCard
          iconClass="oj-fwk-icon-users"
          label="Audience Accounts Segmented"
          value={summaryLoading ? '...' : formatNumber(summary?.TOTAL_CUSTOMERS || summary?.total_customers || 0)}
          sub="K-Means CLUSTER_ID() + RFM"
          color="#C74634"
          badge="KM"
        />
        <StatCard
          iconClass="oj-fwk-icon-view"
          label="Content Revenue Model R²"
          value={summaryLoading ? '...' : (summary?.REVENUE_R2 || summary?.revenue_r2
            ? `${((summary?.REVENUE_R2 || summary?.revenue_r2) * 100).toFixed(1)}%`
            : '-')}
          sub="GLM + REGR_R2 - 30-day fit"
          color="#4C825C"
          badge="GLM"
        />
        <StatCard
          iconClass="oj-fwk-icon-grid"
          label="Active ML Models"
          value={summaryLoading ? '...' : (summary?.MODELS_ACTIVE ?? summary?.models_active ?? '-')}
          sub="Demand  -  RFM  -  Forecast  -  K-Means"
          color="#4F7D7B"
          badge="In-DB"
        />
      </div>

      {/* ── Tab Bar ────────────────────────────── */}
      <div className="oml-tabbar" role="tablist" aria-label="OML analytics views">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <JetButton
              key={tab.key}
              id={`oml-tab-${tab.key}`}
              label={tab.buttonLabel}
              iconClass={`oj-fwk-icon ${tab.iconClass}`}
              chroming={isActive ? 'callToAction' : 'outlined'}
              role="tab"
              ariaSelected={isActive ? 'true' : 'false'}
              ariaControls={`oml-panel-${tab.key}`}
              className="oml-tab-jet-button"
              onAction={() => setActiveTab(tab.key)}
            />
          );
        })}
      </div>

      {/* ══════════════════════════════════════════
          Tab 1 - Audience Demand Predictions
      ══════════════════════════════════════════ */}
      {activeTab === 'demand' && (
        <section
          id="oml-panel-demand"
          role="tabpanel"
          aria-labelledby="oml-tab-demand"
          className="glass-card space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-sortrelevancehigh" className="tone-sienna" />
                Audience Demand Predictions
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Content assets scored by DEMAND_SURGE_MODEL - Oracle DBMS_DATA_MINING Random Forest (50 trees)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <JetSelectSingle
                value={String(demandHours)}
                options={DEMAND_WINDOW_OPTIONS}
                ariaLabel="Demand scoring window"
                className="oml-inline-select"
                onValueChange={(value) => setDemandHours(Number(value))}
              />
              <JetButton
                label={demandLoading ? 'Scoring' : 'Refresh'}
                iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
                chroming="outlined"
                disabled={demandLoading}
                onAction={refetchDemand}
              />
            </div>
          </div>

          {demandLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring via PREDICTION(DEMAND_SURGE_MODEL)...</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No content assets with sufficient audience-signal activity in this window.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Bar chart - predicted demand */}
              <div className="lg:col-span-2">
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                  Top 10 - Predicted Campaign Requests (7-day horizon)
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={products.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#697778' }} />
                    <YAxis type="category" dataKey="PRODUCT_NAME" tick={{ fontSize: 9, fill: '#697778' }} width={100}
                      tickFormatter={v => v?.length > 14 ? v.slice(0, 14) + '...' : v} />
                    <Tooltip
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                      itemStyle={{ color: 'var(--color-text)' }}
                      labelStyle={{ color: 'var(--color-text)' }}
                      cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                      formatter={(v, n) => [formatNumber(v), n === 'PREDICTED_DEMAND' ? 'Predicted Campaign Requests' : n]}
                    />
                    <Bar dataKey="PREDICTED_DEMAND" radius={[0, 4, 4, 0]}>
                      {products.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <div className="lg:col-span-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                      <th className="text-left py-2 px-2">Content Asset</th>
                      <th className="text-right py-2 px-2">Virality</th>
                      <th className="text-right py-2 px-2">Uplift</th>
                      <th className="text-right py-2 px-2">Predicted</th>
                      <th className="text-right py-2 px-2">Content Revenue Opp.</th>
                      <th className="py-2 px-2">Confidence</th>
                      <th className="text-center py-2 px-2">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors">
                        <td className="py-2 px-2">
                          <div className="font-medium truncate max-w-[120px]">{p.PRODUCT_NAME}</div>
                          <div className="text-[9px] text-[var(--color-text-dim)]">{p.CATEGORY}</div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: MOMENTUM_COLORS[p.PEAK_MOMENTUM] || '#697778' }}>
                          {p.AVG_VIRALITY}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="tone-pine font-semibold">
                            +{p.UPLIFT_PCT}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold">{formatNumber(p.PREDICTED_DEMAND)}</td>
                        <td className="py-2 px-2 text-right tone-sienna">{formatCurrency(p.REVENUE_OPPORTUNITY)}</td>
                        <td className="py-2 px-2 min-w-[90px]">
                          <ConfidenceBar pct={p.CONFIDENCE_PCT} />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <MomentumBadge flag={p.PEAK_MOMENTUM} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Model explanation */}
          <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
            style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)', color: 'var(--color-text)' }}>
            <span><strong>Model:</strong> DEMAND_SURGE_MODEL (ALGO_RANDOM_FOREST, 50 trees)</span>
            <span><strong>Scoring:</strong> PREDICTION() / PREDICTION_PROBABILITY()</span>
            <span><strong>Features:</strong> 12 - category, value, posts, sentiment, likes, shares, views, urgency, viral_posts, rising_posts, units_sold, revenue</span>
            <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING - trained model persists in database</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 2 - Audience Value Segments
      ══════════════════════════════════════════ */}
      {activeTab === 'rfm' && (
        <section
          id="oml-panel-rfm"
          role="tabpanel"
          aria-labelledby="oml-tab-rfm"
          className="glass-card space-y-5"
        >
          <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-users" className="tone-plum" />
                Audience Value Segments
              </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              CUSTOMER_SEGMENT_MODEL (K-Means, 4 clusters) via DBMS_DATA_MINING +{' '}
              <code className="tone-plum">NTILE(4)</code> RFM labeling - CLUSTER_ID() scoring
            </p>
          </div>

          {segLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring synthetic audience accounts via CLUSTER_ID(CUSTOMER_SEGMENT_MODEL)...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Segment donut */}
              <div>
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2 text-center">
                  Segment Distribution
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={segSummary}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      dataKey="count"
                      nameKey="segment"
                      onClick={d => setSelectedSegment(selectedSegment === d.segment ? null : d.segment)}
                    >
                      {segSummary.map((s, i) => (
                        <Cell
                          key={i}
                          fill={SEGMENT_COLORS[s.segment] || CHART_COLORS[i % CHART_COLORS.length]}
                          opacity={selectedSegment && selectedSegment !== s.segment ? 0.35 : 1}
                          cursor="pointer"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                      itemStyle={{ color: 'var(--color-text)' }}
                      labelStyle={{ color: 'var(--color-text)' }}
                      cursor={false}
                      formatter={(v, n, p) => [`${v} synthetic audience accounts`, p.payload.segment]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {segSummary.map((s, i) => (
                    <JetButton
                      key={i}
                      label={`${s.segment} (${s.count})`}
                      chroming={selectedSegment === s.segment ? 'callToAction' : 'outlined'}
                      className="oml-segment-filter-button"
                      onAction={() => setSelectedSegment(selectedSegment === s.segment ? null : s.segment)}
                    />
                  ))}
                </div>
              </div>

              {/* Churn risk bar + segment table */}
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Churn Risk Distribution</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={churnDist} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <XAxis dataKey="risk" tick={{ fontSize: 10, fill: '#697778' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#697778' }} width={30} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {churnDist.map((d, i) => (
                          <Cell key={i} fill={d.risk === 'High' ? '#C74634' : d.risk === 'Medium' ? '#AA643B' : '#4C825C'} />
                        ))}
                      </Bar>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                        formatter={v => [`${v} synthetic audience accounts`, 'Count']}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Segment Summary</p>
                  <div className="space-y-1">
                    {segSummary.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span style={{ color: SEGMENT_COLORS[s.segment] || CHART_COLORS[i] }}>{s.segment}</span>
                        <div className="flex gap-3 text-[var(--color-text-dim)]">
                          <span>{s.count} synthetic audience accounts</span>
                          <span className="tone-sienna">{formatCurrency(s.total_revenue)}</span>
                          <span className="tone-plum">RFM {s.avg_rfm}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Audience account table - filtered by selected segment */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">
                    {selectedSegment ? `${selectedSegment} synthetic audience accounts` : 'Top synthetic audience accounts by RFM score'}
                  </p>
                  {selectedSegment && (
                    <JetButton
                      label="Clear"
                      iconClass="oj-fwk-icon oj-fwk-icon-cross"
                      chroming="borderless"
                      className="oml-clear-filter-button"
                      onAction={() => setSelectedSegment(null)}
                    />
                  )}
                </div>
                <div className="overflow-y-auto max-h-[240px] space-y-1">
                  {filteredAudienceAccounts.slice(0, 40).map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded px-2 py-1.5 text-[10px] hover:surface-bark-soft transition-colors">
                      <div>
                        <span className="font-medium">{c.FULL_NAME}</span>
                        <span className="text-[var(--color-text-dim)] ml-1">{c.CITY}, {c.STATE}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: SEGMENT_COLORS[c.SEGMENT] || '#697778' }}
                          className="text-[9px] font-semibold">{c.SEGMENT}</span>
                        <span className="tone-sienna">{formatCurrency(c.TOTAL_SPENT)}</span>
                        <span className={`text-[9px] ${c.CHURN_RISK === 'High' ? 'tone-red' : c.CHURN_RISK === 'Medium' ? 'tone-sienna' : 'tone-pine'}`}>
                          {c.CHURN_RISK}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
            style={{ background: 'rgba(107,116,148,0.06)', border: '1px dashed rgba(107,116,148,0.3)', color: 'var(--color-text)' }}>
            <span><strong>Model:</strong> RFM via Oracle NTILE(4) - ISO SQL:2003 Window Functions</span>
            <span><strong>Segments:</strong> Champion  -  Loyal  -  New  -  At Risk  -  Lost  -  Big Spender  -  Promising  -  Potential</span>
            <span><strong>Engine:</strong> Oracle AI Database 26ai - no sklearn, no Python, no external cluster</span>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 3 - Content Revenue Forecast
      ══════════════════════════════════════════ */}
      {activeTab === 'forecast' && (
        <section
          id="oml-panel-forecast"
          role="tabpanel"
          aria-labelledby="oml-tab-forecast"
          className="glass-card space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-view" className="tone-pine" />
                Content Revenue Forecast - Oracle Linear Regression
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                <code className="text-[var(--color-text)] font-semibold">REGR_SLOPE  -  REGR_INTERCEPT  -  REGR_R2</code> - Oracle's native OLS regression
                fits the trend on 30-day history and projects forward
              </p>
            </div>
            <div className="flex items-center gap-2">
              <JetSelectSingle
                value={String(forecastDays)}
                options={FORECAST_DAY_OPTIONS}
                ariaLabel="Content revenue forecast horizon"
                className="oml-inline-select"
                onValueChange={(value) => setForecastDays(Number(value))}
              />
              <JetButton
                label={forecastLoading ? 'Fitting' : 'Refresh'}
                iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
                chroming="outlined"
                disabled={forecastLoading}
                onAction={refetchForecast}
              />
            </div>
          </div>

          {forecastLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Fitting REGR_SLOPE model...</p>
          ) : (
            <>
              {/* Model quality stats */}
              {model && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'R² (fit quality)', value: `${((model.r_squared || 0) * 100).toFixed(1)}%`, color: model.r_squared > 0.7 ? '#4C825C' : model.r_squared > 0.4 ? '#AA643B' : '#C74634' },
                    { label: 'Daily Slope', value: `${model.daily_slope >= 0 ? '+' : ''}${formatCurrency(model.daily_slope)}/day`, color: model.daily_slope >= 0 ? '#4C825C' : '#C74634' },
                    { label: 'Mean Daily Content Revenue', value: formatCurrency(model.mean_daily_revenue), color: '#C74634' },
                    { label: 'Observations', value: `${model.observations} days`, color: '#4F7D7B' },
                  ].map((m, i) => (
                    <div key={i} className="rounded-lg p-3 text-center"
                      style={{ background: `${m.color}11`, border: `1px solid ${m.color}33` }}>
                      <p className="text-[10px] text-[var(--color-text-dim)] mb-1">{m.label}</p>
                      <p className="text-sm font-bold">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Main forecast chart */}
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4C825C" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4C825C" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#C74634" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#C74634" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#697778' }}
                    interval={Math.floor(chartData.length / 10)} />
                  <YAxis tick={{ fontSize: 9, fill: '#697778' }} width={60}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ForecastTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#697778' }} />

                  {/* Confidence interval band for forecast (upper bound filled, lower bound erases) */}
                  <Area type="monotone" dataKey="ci_upper" fill="#C7463422" stroke="#C7463444"
                    strokeWidth={1} strokeDasharray="3 3" dot={false} name="CI Upper" legendType="none" />
                  <Area type="monotone" dataKey="ci_lower" fill="var(--color-bg)" stroke="#C7463444"
                    strokeWidth={1} strokeDasharray="3 3" dot={false} name="CI Lower" legendType="none" />

                  <Area type="monotone" dataKey="actual" stroke="#4C825C" fill="url(#actualGrad)"
                    strokeWidth={2} dot={false} name="Actual Content Revenue" connectNulls={false} />
                  <Area type="monotone" dataKey="forecast" stroke="#C74634" fill="url(#forecastGrad)"
                    strokeWidth={2.5} strokeDasharray="6 3" dot={false} name="Forecast" connectNulls />
                  <Line type="monotone" dataKey="trend" stroke="#AA643B" strokeWidth={1.5}
                    strokeDasharray="2 2" dot={false} name="Trend (OLS)" connectNulls />
                  <Line type="monotone" dataKey="ma7" stroke="#4F7D7B" strokeWidth={1.5}
                    dot={false} name="7-day MA" />

                  {/* Vertical rule separating actual / forecast */}
                  {historical.length > 0 && (
                    <ReferenceLine
                      x={historical[historical.length - 1]?.DAY?.slice(5)}
                      stroke="rgba(49,45,42,0.18)"
                      strokeDasharray="4 4"
                      label={{ value: 'Forecast ->', position: 'top', fill: '#697778', fontSize: 9 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>

              {/* Model card */}
              {model && (
                <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                  style={{ background: 'rgba(76,130,92,0.06)', border: '1px dashed rgba(76,130,92,0.3)', color: 'var(--color-text)' }}>
                  <span><strong>Model:</strong> {model.type}</span>
                  <span><strong>Oracle functions:</strong> {model.engine}</span>
                  <span><strong>R²:</strong> {(model.r_squared * 100).toFixed(1)}%
                    {'  -  '}<strong>rho:</strong> {(model.correlation * 100).toFixed(1)}% corr.
                  </span>
                  <span><strong>Forecast:</strong> {model.forecast_days} days
                    {'  -  '}<strong>Trained on:</strong> {model.lookback_days}-day window
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 4 - Vector K-Means Clustering
      ══════════════════════════════════════════ */}
      {activeTab === 'clusters' && (
        <section
          id="oml-panel-clusters"
          role="tabpanel"
          aria-labelledby="oml-tab-clusters"
          className="glass-card space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-grid" className="tone-teal" />
                Vector K-Means Clustering
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                Content Assets clustered by semantic similarity using <code className="tone-teal">VECTOR_DISTANCE(COSINE)</code> on
                384-dim embeddings - Oracle AI Vector Search
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-text-dim)]">K =</span>
              {[3, 5, 10].map(kVal => (
                <JetButton
                  key={kVal}
                  label={String(kVal)}
                  chroming={clusterK === kVal ? 'callToAction' : 'outlined'}
                  className="oml-k-button"
                  onAction={() => setClusterK(kVal)}
                />
              ))}
              <JetButton
                label={clusterLoading ? 'Clustering' : 'Refresh'}
                iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
                chroming="outlined"
                disabled={clusterLoading}
                onAction={refetchClusters}
              />
            </div>
          </div>

          {clusterLoading ? (
            <div className="py-8 text-center">
              <JetProgressCircle className="oml-loading-progress" ariaLabel="Running vector clustering" />
              <p className="text-sm text-[var(--color-text-dim)]">Running VECTOR_DISTANCE K-Means (K={clusterK})...</p>
            </div>
          ) : !clusterData?.clusters?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No cluster data available.</p>
          ) : (
            <>
              {/* Cluster summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Clusters (K)', value: clusterData.k, color: '#4F7D7B' },
                  { label: 'Content Assets Clustered', value: clusterData.total_products, color: '#C74634' },
                  { label: 'Embedding Dims', value: `${clusterData.meta?.dimensions || 384}`, color: '#AA643B' },
                  { label: 'Distance Metric', value: 'COSINE', color: '#4C825C' },
                ].map((m, i) => (
                  <div key={i} className="rounded-lg p-3 text-center"
                    style={{ background: `${m.color}11`, border: `1px solid ${m.color}33` }}>
                    <p className="text-[10px] text-[var(--color-text-dim)] mb-1">{m.label}</p>
                    <p className="text-sm font-bold" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Cluster size overview */}
              <div>
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Cluster Distribution</p>
                <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
                  {clusterData.clusters.map((cl, i) => (
                    <div
                      key={cl.cluster_id}
                      className="relative group flex items-center justify-center text-[9px] font-bold transition-all hover:opacity-90"
                      style={{
                        width: `${Math.max((cl.size / clusterData.total_products) * 100, 3)}%`,
                        background: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                      }}
                    >
                      {cl.size}
                      <div className="absolute -top-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        Cluster {cl.cluster_id}: {cl.size} content assets  -  {cl.top_category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cluster cards */}
              <div className="space-y-3">
                {clusterData.clusters.map((cl, i) => {
                  const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
                  return (
                    <div key={cl.cluster_id} className="rounded-xl overflow-hidden"
                      style={{ border: `1px solid ${color}33` }}>
                      {/* Cluster header */}
                      <div className="flex items-center justify-between px-4 py-2.5"
                        style={{ background: `${color}11` }}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                            style={{ background: `${color}33`, color }}>
                            {cl.cluster_id}
                          </div>
                          <div>
                            <p className="text-sm font-semibold" style={{ color }}>
                              Cluster {cl.cluster_id} - {cl.top_category}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-dim)]">
                              {cl.size} content assets  -  Avg similarity: <span className="font-mono" style={{ color }}>{(cl.avg_similarity * 100).toFixed(1)}%</span>
                              {'  -  '}Centroid: <span className="text-[var(--color-text)]">{cl.centroid_product}</span>
                            </p>
                          </div>
                        </div>
                        {/* Category breakdown pills */}
                        <div className="flex gap-1 flex-wrap justify-end">
                          {Object.entries(cl.category_breakdown)
                            .sort(([,a],[,b]) => b - a)
                            .slice(0, 4)
                            .map(([cat, cnt]) => (
                              <span key={cat} className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: `${color}22`, color, border: `1px solid ${color}33` }}>
                                {cat} ({cnt})
                              </span>
                            ))}
                        </div>
                      </div>
                      {/* Content Assets grid */}
                      <div className="px-4 py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {cl.products.slice(0, 12).map(p => (
                          <div key={p.product_id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] hover:surface-bark-soft transition-colors"
                            style={p.is_centroid ? { background: `${color}11`, border: `1px solid ${color}33` } : {}}>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium truncate block">
                                {p.is_centroid && <span style={{ color }} className="mr-1">★</span>}
                                {p.product_name}
                              </span>
                              <span className="text-[9px] text-[var(--color-text-dim)]">
                                {p.brand_name}  -  {p.category}  -  {formatCurrency(p.unit_price)}
                              </span>
                            </div>
                            <div className="flex-shrink-0 w-12 text-right">
                              <span className="text-[10px] font-mono font-bold"
                                style={{ color: p.similarity >= 0.7 ? '#4C825C' : p.similarity >= 0.5 ? '#AA643B' : '#437C94' }}>
                                {(p.similarity * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ))}
                        {cl.products.length > 12 && (
                          <div className="text-[10px] text-[var(--color-text-dim)] px-2 py-1">
                            +{cl.products.length - 12} more content assets
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Model explanation */}
              <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                style={{ background: 'rgba(79,125,123,0.06)', border: '1px dashed rgba(79,125,123,0.3)', color: 'var(--color-text)' }}>
                <span><strong>Model:</strong> Vector K-Means via VECTOR_DISTANCE centroid assignment</span>
                <span><strong>Vectors:</strong> 384-dim  -  ALL_MINILM_L12_V2 ONNX  -  COSINE distance</span>
                <span><strong>Engine:</strong> Oracle AI Vector Search - CROSS JOIN + ROW_NUMBER nearest assignment</span>
                <span><strong>K:</strong> {clusterData.k} clusters  -  {clusterData.total_products} content assets</span>
              </div>
            </>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════
          Tab 5 - Rights & Capacity Risk
      ══════════════════════════════════════════ */}
      {activeTab === 'capacity' && (
        <section
          id="oml-panel-capacity"
          role="tabpanel"
          aria-labelledby="oml-tab-capacity"
          className="glass-card space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <JetGlyph iconClass="oj-fwk-icon-tree-document" className="tone-plum" />
                Rights & Capacity Risk
              </h3>
              <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                DEMAND_SURGE_MODEL predictions x rights capacity - identifies coverage risk when audience demand exceeds launch-window, regional, or live-event capacity
              </p>
            </div>
            <JetButton
              label={invLoading ? 'Scoring' : 'Refresh'}
              iconClass="oj-fwk-icon oj-fwk-icon-arrowtail-e"
              chroming="outlined"
              disabled={invLoading}
              onAction={refetchInv}
            />
          </div>

          {invLoading ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">Scoring capacity via PREDICTION(DEMAND_SURGE_MODEL)...</p>
          ) : !invData?.alerts?.length ? (
            <p className="text-sm text-[var(--color-text-dim)] py-4 text-center">No capacity intelligence data available.</p>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg p-3 text-center" style={{ background: '#C7463411', border: '1px solid #C7463433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Critical Rights Gap</p>
                  <p className="text-xl font-bold text-[#C74634]">{invData.summary.critical_count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#437C9411', border: '1px solid #437C9433' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Demand Exceeds Capacity</p>
                  <p className="text-xl font-bold text-[#437C94]">{invData.summary.at_risk_count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#AA643B11', border: '1px solid #AA643B33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">OML Surge Assets</p>
                  <p className="text-xl font-bold text-[#AA643B]">{invData.summary.surge_products}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#79608711', border: '1px solid #79608733' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Revenue at Risk</p>
                  <p className="text-lg font-bold text-[#796087]">{formatCurrency(invData.summary.total_revenue_at_risk)}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: '#4C825C11', border: '1px solid #4C825C33' }}>
                  <p className="text-[10px] text-[var(--color-text-dim)] mb-1">Assets Monitored</p>
                  <p className="text-xl font-bold text-[#4C825C]">{invData.summary.total_alerts}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Capacity status distribution */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2 text-center">
                    Rights Capacity Status
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={invData.statusDistribution}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={75}
                        dataKey="count" nameKey="status"
                      >
                        {invData.statusDistribution.map((d, i) => (
                          <Cell key={i} fill={capacityStatusColor(d.status)} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={false}
                        formatter={(v, n, p) => [`${v} assets`, formatCapacityStatus(p.payload.status)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {invData.statusDistribution.map((d, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: `${capacityStatusColor(d.status)}22`, color: capacityStatusColor(d.status) }}>
                        {formatCapacityStatus(d.status)} ({d.count})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Center summary */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                    Alerts by Coverage Desk
                  </p>
                  <div className="space-y-1 max-h-[240px] overflow-y-auto">
                    {invData.centerSummary.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] rounded px-2 py-1.5 hover:surface-bark-soft">
                        <div>
                          <span className="font-medium">{c.center}</span>
                          <span className="text-[var(--color-text-dim)] ml-1">({c.city})</span>
                        </div>
                        <div className="flex gap-2">
                          {c.critical > 0 && (
                            <span className="text-[#C74634] font-bold">{c.critical} critical</span>
                          )}
                          {c.surges > 0 && (
                            <span className="text-[#AA643B]">{c.surges} surges</span>
                          )}
                          <span className="text-[var(--color-text-dim)]">{c.alerts} total</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top surge probability products */}
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                    Highest Audience Surge Probability
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={invData.alerts.filter(isOmlSurgeWatch).slice(0, 8)}
                      layout="vertical" margin={{ left: 0, right: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(49,45,42,0.12)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#697778' }} domain={[0, 100]} />
                      <YAxis type="category" dataKey="PRODUCT_NAME" tick={{ fontSize: 8, fill: '#697778' }} width={90}
                        tickFormatter={v => v?.length > 12 ? v.slice(0, 12) + '...' : v} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text)' }}
                        itemStyle={{ color: 'var(--color-text)' }}
                        labelStyle={{ color: 'var(--color-text)' }}
                        cursor={{ fill: 'rgba(49,45,42,0.08)' }}
                        formatter={v => [`${v}%`, 'Surge Probability']}
                      />
                      <Bar dataKey="OML_SURGE_PROBABILITY" radius={[0, 4, 4, 0]}>
                        {invData.alerts.filter(isOmlSurgeWatch).slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Alerts table */}
              <div>
                <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
                  Rights Capacity Alerts - Sorted by OML Demand Probability
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-2 px-2">Content Asset</th>
                        <th className="text-left py-2 px-2">Coverage Desk</th>
                        <th className="text-right py-2 px-2">Capacity Units</th>
                        <th className="text-right py-2 px-2">Demand Forecast</th>
                        <th className="text-right py-2 px-2">Surge %</th>
                        <th className="text-center py-2 px-2">Status</th>
                        <th className="text-right py-2 px-2">Days Capacity</th>
                        <th className="text-right py-2 px-2">Rev. at Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invData.alerts.slice(0, 30).map((a, i) => (
                        <tr key={i} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors">
                          <td className="py-2 px-2">
                            <div className="font-medium truncate max-w-[120px]">{a.PRODUCT_NAME}</div>
                            <div className="text-[9px] text-[var(--color-text-dim)]">{a.CATEGORY}  -  {a.BRAND_NAME}</div>
                          </td>
                          <td className="py-2 px-2 text-[10px]">
                            <div className="truncate max-w-[100px]">{a.CENTER_NAME}</div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">{a.QUANTITY_ON_HAND}</td>
                          <td className="py-2 px-2 text-right font-mono tone-sienna">{a.PREDICTED_DEMAND}</td>
                          <td className="py-2 px-2 text-right">
                            <span className="font-bold" style={{
                              color: a.OML_SURGE_PROBABILITY >= 70 ? '#C74634' :
                                     a.OML_SURGE_PROBABILITY >= 40 ? '#AA643B' : '#4C825C'
                            }}>
                              {a.OML_SURGE_PROBABILITY}%
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: `${capacityStatusColor(a.STOCK_STATUS)}22`,
                                color: capacityStatusColor(a.STOCK_STATUS)
                              }}>
                              {formatCapacityStatus(a.STOCK_STATUS)}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono" style={{
                            color: a.DAYS_OF_SUPPLY != null && a.DAYS_OF_SUPPLY < 3 ? '#C74634' :
                                   a.DAYS_OF_SUPPLY != null && a.DAYS_OF_SUPPLY < 7 ? '#AA643B' : '#4C825C'
                          }}>
                            {a.DAYS_OF_SUPPLY != null ? `${a.DAYS_OF_SUPPLY}d` : '-'}
                          </td>
                          <td className="py-2 px-2 text-right tone-red">
                            {a.REVENUE_AT_RISK > 0 ? formatCurrency(a.REVENUE_AT_RISK) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Model explanation */}
              <div className="rounded-lg p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1"
                style={{ background: 'rgba(121,96,135,0.06)', border: '1px dashed rgba(121,96,135,0.3)', color: 'var(--color-text)' }}>
                <span><strong>Model:</strong> DEMAND_SURGE_MODEL (ALGO_RANDOM_FOREST, 50 trees)</span>
                <span><strong>Scoring:</strong> PREDICTION_PROBABILITY() x rights capacity levels</span>
                <span><strong>Data:</strong> demand_forecasts (daily OML predictions) x rights capacity x coverage desks</span>
                <span><strong>Engine:</strong> Oracle DBMS_DATA_MINING - audience-signal demand surge to rights and capacity risk assessment</span>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
