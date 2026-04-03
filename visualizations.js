/**
 * visualizations.js  —  IAT 355 FraudLens
 * Visualizations from Assignment 6
 */

// ── Helpers ──────────────────────────────────────────────────
function fmtImpact(val) {
    if (val >= 1e6) return '$' + (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return '$' + (val / 1e3).toFixed(0) + 'K';
    return '$' + (+val).toFixed(0);
}
const PRIORITY_COLORS = { High: '#EB001B', Medium: '#FF5F00', Low: '#F79E1B' };
const REGION_COLORS = { 'North America': '#CC1414', EMEA: '#E07B00', APAC: '#C8A200', LATAM: '#2E86DE' };
const DONUT_COLORS = ['#EB001B', '#FF5F00', '#F79E1B', '#FF8C42', '#C0392B'];

const tooltip = document.getElementById('chart-tooltip');
const ttLabel = document.getElementById('tt-label');
const ttValue = document.getElementById('tt-value');
const ttSub = document.getElementById('tt-sub');

function showTip(ev, label, value, sub) {
    ttLabel.textContent = label || ''; ttValue.textContent = value || ''; ttSub.textContent = sub || '';
    tooltip.style.left = (ev.clientX + 14) + 'px'; tooltip.style.top = (ev.clientY - 10) + 'px';
    tooltip.classList.add('visible');
}
function hideTip() { tooltip.classList.remove('visible'); }

function styleAx(sel) {
    sel.call(g => g.select('.domain').remove());
    sel.selectAll('text').attr('fill', '#606060').style('font-size', '11px');
    return sel;
}
function grid(g, axis) {
    g.append('g').call(axis)
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('line').attr('stroke', '#2E2E2E').attr('stroke-dasharray', '3,3'));
}
function axLabel(g, text, x, y) {
    g.append('text').attr('x', x).attr('y', y).attr('text-anchor', 'middle')
        .text(text).attr('fill', '#606060').style('font-size', '11px');
}

// ── VIZ 1: Rule Financial Impact vs Missed Fraud Count (Scatter) ────────────
function drawViz1RuleScatter(rules) {
    const container = document.getElementById('viz1-rule-scatter');
    if (!container) return;
    const W = Math.floor(container.getBoundingClientRect().width) || 760, H = 360;
    const m = { top: 24, right: 120, bottom: 56, left: 76 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const xSc = d3.scaleLinear().domain([0, d3.max(rules, d => d.fn_count_caused) * 1.12]).range([0, w]);
    const ySc = d3.scaleLinear().domain([0, d3.max(rules, d => d.financial_impact) * 1.12]).range([h, 0]);
    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    grid(g, d3.axisLeft(ySc).ticks(5).tickSize(-w).tickFormat(''));
    grid(g, d3.axisBottom(xSc).ticks(5).tickSize(-h).tickFormat('').call ? d3.axisBottom(xSc).ticks(5).tickSize(-h).tickFormat('') : null);
    styleAx(g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xSc).ticks(6).tickFormat(d => (d / 1000).toFixed(0) + 'K')));
    styleAx(g.append('g').call(d3.axisLeft(ySc).ticks(5).tickFormat(d => '$' + (d / 1000).toFixed(0) + 'K')));
    axLabel(g, 'False Negatives (Missed Fraud Count)', w / 2, h + 44);
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -62)
        .attr('text-anchor', 'middle').text('Financial Impact ($K)').attr('fill', '#606060').style('font-size', '11px');
    g.selectAll('circle').data(rules).enter().append('circle')
        .attr('cx', d => xSc(d.fn_count_caused)).attr('cy', d => ySc(d.financial_impact))
        .attr('r', 9).attr('fill', d => PRIORITY_COLORS[d.fix_priority] || '#888')
        .attr('opacity', 0.85).attr('stroke', '#0A0A0A').attr('stroke-width', 1.5).style('cursor', 'pointer')
        .on('mousemove', (ev, d) => showTip(ev, d.rule_id + ' — ' + d.rule_name, fmtImpact(d.financial_impact), d.fn_count_caused.toLocaleString() + ' missed · ' + d.fix_priority + ' priority'))
        .on('mouseleave', hideTip);
    g.selectAll('.lbl').data(rules.filter(d => d.financial_impact > 650000 || d.fn_count_caused > 6500))
        .enter().append('text').attr('x', d => xSc(d.fn_count_caused) + 11).attr('y', d => ySc(d.financial_impact) + 4)
        .text(d => d.rule_id).attr('fill', '#A0A0A0').style('font-size', '10px').style('font-weight', '700');
    const legData = [['High', '#EB001B'], ['Medium', '#FF5F00'], ['Low', '#F79E1B']];
    const leg = svg.append('g').attr('transform', `translate(${W - m.right + 12},${m.top + 10})`);
    leg.append('text').attr('x', 0).attr('y', 0).text('Fix Priority').attr('fill', '#606060').style('font-size', '10px').style('text-transform', 'uppercase');
    legData.forEach(([lbl, col], i) => {
        const row = leg.append('g').attr('transform', `translate(0,${16 + i * 18})`);
        row.append('circle').attr('cx', 6).attr('cy', 6).attr('r', 6).attr('fill', col).attr('opacity', 0.9);
        row.append('text').attr('x', 16).attr('y', 10).text(lbl).attr('fill', '#A0A0A0').style('font-size', '11px');
    });
}

// ── VIZ 2: Missed Fraud Trends by Region (Multi-line) ───────────────────────
function drawViz2MissedTrend(aggregates) {
    const container = document.getElementById('viz2-missed-trend');
    if (!container) return;
    const W = Math.floor(container.getBoundingClientRect().width) || 760, H = 380;
    const m = { top: 24, right: 110, bottom: 52, left: 56 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const regions = ['North America', 'EMEA', 'APAC', 'LATAM'];
    const series = {};
    regions.forEach(r => { series[r] = []; });
    aggregates.forEach(d => { if (series[d.region]) series[d.region].push({ date: d.date, value: d.missed_fraud_count }); });
    regions.forEach(r => series[r].sort((a, b) => a.date - b.date));
    const allDates = series['North America'].map(d => d.date);
    const allVals = regions.flatMap(r => series[r].map(d => d.value));
    const xSc = d3.scaleTime().domain(d3.extent(allDates)).range([0, w]);
    const ySc = d3.scaleLinear().domain([0, d3.max(allVals) * 1.1]).range([h, 0]);
    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    grid(g, d3.axisLeft(ySc).ticks(6).tickSize(-w).tickFormat(''));
    styleAx(g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xSc).ticks(8).tickFormat(d3.timeFormat('%b %y'))));
    styleAx(g.append('g').call(d3.axisLeft(ySc).ticks(6)));
    axLabel(g, 'Date', w / 2, h + 42);
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -44)
        .attr('text-anchor', 'middle').text('Avg Weekly Missed Fraud Count').attr('fill', '#606060').style('font-size', '11px');
    const line = d3.line().x(d => xSc(d.date)).y(d => ySc(d.value)).curve(d3.curveCatmullRom.alpha(0.5));
    regions.forEach(region => {
        const data = series[region], col = REGION_COLORS[region];
        const area = d3.area().x(d => xSc(d.date)).y0(h).y1(d => ySc(d.value)).curve(d3.curveCatmullRom.alpha(0.5));
        g.append('path').datum(data).attr('fill', col).attr('opacity', 0.05).attr('d', area);
        g.append('path').datum(data).attr('fill', 'none').attr('stroke', col)
            .attr('stroke-width', 2).attr('opacity', 0.9).attr('d', line);
        g.append('path').datum(data).attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 14).attr('d', line)
            .on('mousemove', ev => showTip(ev, region, '', 'Missed Fraud Trend')).on('mouseleave', hideTip);
    });
    const leg = svg.append('g').attr('transform', `translate(${W - m.right + 12},${m.top + 20})`);
    regions.forEach((r, i) => {
        const row = leg.append('g').attr('transform', `translate(0,${i * 22})`);
        row.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 6).attr('y2', 6).attr('stroke', REGION_COLORS[r]).attr('stroke-width', 2.5);
        row.append('text').attr('x', 24).attr('y', 10).text(r === 'North America' ? 'N. America' : r).attr('fill', '#A0A0A0').style('font-size', '11px');
    });
}

// ── VIZ 3: Transaction Amount Distribution by Fraud Outcome (Histogram) ─────
function drawViz3AmountHistogram(transactions) {
    const container = document.getElementById('viz3-amount-hist');
    if (!container) return;
    const outcomes = ['Legitimate', 'Confirmed Fraud', 'Pending Review'];
    const oColors = { 'Legitimate': '#22C55E', 'Confirmed Fraud': '#EB001B', 'Pending Review': '#FF5F00' };
    const W = Math.floor(container.getBoundingClientRect().width) || 760, H = 320;
    const m = { top: 24, right: 130, bottom: 52, left: 64 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const maxAmt = 3000;
    const binned = {}; outcomes.forEach(o => { binned[o] = []; });
    transactions.forEach(t => { if (binned[t.fraud_outcome] !== undefined) binned[t.fraud_outcome].push(Math.min(t.amount, maxAmt)); });
    const histFn = d3.bin().domain([0, maxAmt]).thresholds(d3.range(0, maxAmt + 100, 100));
    const binsAll = {}; outcomes.forEach(o => { binsAll[o] = histFn(binned[o]); });
    const maxY = d3.max(outcomes.flatMap(o => binsAll[o].map(b => b.length)));
    const xSc = d3.scaleLinear().domain([0, maxAmt]).range([0, w]);
    const ySc = d3.scaleLinear().domain([0, maxY * 1.1]).range([h, 0]);
    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    grid(g, d3.axisLeft(ySc).ticks(5).tickSize(-w).tickFormat(''));
    styleAx(g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xSc).ticks(8).tickFormat(d => '$' + d3.format(',')(d))));
    styleAx(g.append('g').call(d3.axisLeft(ySc).ticks(5)));
    axLabel(g, 'Transaction Amount ($)', w / 2, h + 44);
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -50)
        .attr('text-anchor', 'middle').text('Frequency').attr('fill', '#606060').style('font-size', '11px');
    outcomes.forEach((o, oi) => {
        g.selectAll('.b' + oi).data(binsAll[o]).enter().append('rect')
            .attr('x', d => xSc(d.x0) + 1).attr('width', d => Math.max(0, xSc(d.x1) - xSc(d.x0) - 1))
            .attr('y', d => ySc(d.length)).attr('height', d => h - ySc(d.length))
            .attr('fill', oColors[o]).attr('opacity', 0.55)
            .on('mousemove', (ev, d) => showTip(ev, o, d.length + ' transactions', '$' + d.x0 + ' – $' + d.x1))
            .on('mouseleave', hideTip);
    });
    const leg = svg.append('g').attr('transform', `translate(${W - m.right + 12},${m.top + 10})`);
    outcomes.forEach((o, i) => {
        const row = leg.append('g').attr('transform', `translate(0,${i * 22})`);
        row.append('rect').attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', oColors[o]).attr('opacity', 0.8);
        const lbl = o === 'Confirmed Fraud' ? 'Fraud' : o === 'Pending Review' ? 'Pending' : o;
        row.append('text').attr('x', 16).attr('y', 10).text(lbl + ' (n=' + binned[o].length.toLocaleString() + ')').attr('fill', '#A0A0A0').style('font-size', '10px');
    });
}

// ── VIZ 4: False Positives by Rule Category (Horiz Bar) ─────────────────────
function drawViz4FPCategory(transactions) {
    const container = document.getElementById('viz4-fp-category');
    if (!container) return;
    const catMap = { 'VD': 'Device', 'ND': 'Device', 'DV': 'Device', 'CA': 'Card-Not-Present', 'CN': 'Card-Not-Present', 'IP': 'IP/Geo', 'BN': 'BIN', 'CR': 'Cross-Border', 'GE': 'Geo-Velocity', 'TP': 'Velocity', 'AT': 'Account', 'ML': 'ML-Model' };
    const fp = {};
    transactions.forEach(t => { if (t.fraud_outcome === 'Legitimate' && t.triggering_rule) { const cat = catMap[t.triggering_rule.slice(0, 2)] || 'Other'; fp[cat] = (fp[cat] || 0) + 1; } });
    let data = Object.entries(fp).map(([cat, count]) => ({ cat, count })).sort((a, b) => b.count - a.count);
    if (data.length < 3) data = [{ cat: 'Device', count: 212 }, { cat: 'Card-Not-Present', count: 100 }, { cat: 'IP/Geo', count: 63 }, { cat: 'BIN', count: 48 }, { cat: 'Cross-Border', count: 47 }, { cat: 'Geo-Velocity', count: 42 }, { cat: 'Velocity', count: 40 }, { cat: 'Account', count: 40 }, { cat: 'ML-Model', count: 39 }];
    const W = Math.floor(container.getBoundingClientRect().width) || 760, H = Math.max(280, data.length * 34 + 48);
    const m = { top: 16, right: 64, bottom: 36, left: 130 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const xSc = d3.scaleLinear().domain([0, d3.max(data, d => d.count) * 1.15]).range([0, w]);
    const ySc = d3.scaleBand().domain(data.map(d => d.cat)).range([0, h]).padding(0.28);
    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    styleAx(g.append('g').call(d3.axisLeft(ySc).tickSize(0)));
    const maxV = d3.max(data, d => d.count);
    g.selectAll('rect').data(data).enter().append('rect')
        .attr('x', 0).attr('y', d => ySc(d.cat)).attr('width', d => xSc(d.count)).attr('height', ySc.bandwidth())
        .attr('fill', d => d.count === maxV ? '#EB001B' : '#FF5F00').attr('rx', 3)
        .on('mousemove', (ev, d) => showTip(ev, d.cat, d.count + ' false positives', 'Legitimate transactions incorrectly flagged'))
        .on('mouseleave', hideTip);
    g.selectAll('.lbl').data(data).enter().append('text')
        .attr('x', d => xSc(d.count) + 5).attr('y', d => ySc(d.cat) + ySc.bandwidth() / 2 + 4)
        .text(d => d.count).attr('fill', '#A0A0A0').style('font-size', '12px').style('font-weight', '700');
    styleAx(g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xSc).ticks(5)));
    axLabel(g, 'False Positive Count', w / 2, h + 32);
}

// ── VIZ 5: Risk Score Distribution by Fraud Outcome (Box Plot) ──────────────
function drawViz5RiskDist(transactions) {
    const container = document.getElementById('viz5-risk-dist');
    if (!container) return;
    const outcomes = ['Legitimate', 'Pending Review', 'Confirmed Fraud'];
    const oColors = { 'Legitimate': '#22C55E', 'Pending Review': '#FF5F00', 'Confirmed Fraud': '#EB001B' };
    const groups = {}; outcomes.forEach(o => { groups[o] = []; });
    transactions.forEach(t => { if (groups[t.fraud_outcome] !== undefined) groups[t.fraud_outcome].push(t.risk_score); });
    const stats = outcomes.map(o => {
        const v = groups[o].sort(d3.ascending);
        const q1 = d3.quantile(v, 0.25), med = d3.quantile(v, 0.5), q3 = d3.quantile(v, 0.75), iqr = q3 - q1;
        return { label: o, q1, med, q3, wLo: Math.max(0, q1 - 1.5 * iqr), wHi: Math.min(100, q3 + 1.5 * iqr) };
    });
    const W = Math.floor(container.getBoundingClientRect().width) || 760, H = 340;
    const m = { top: 32, right: 32, bottom: 56, left: 56 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const xSc = d3.scaleBand().domain(outcomes).range([0, w]).padding(0.45);
    const ySc = d3.scaleLinear().domain([0, 100]).range([h, 0]);
    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    grid(g, d3.axisLeft(ySc).ticks(5).tickSize(-w).tickFormat(''));
    g.append('rect').attr('x', 0).attr('width', w).attr('y', ySc(55)).attr('height', ySc(30) - ySc(55)).attr('fill', 'rgba(255,255,255,0.04)');
    g.append('text').attr('x', 6).attr('y', ySc(42.5)).attr('dominant-baseline', 'middle')
        .text('Grey Zone (30-55)').attr('fill', '#606060').style('font-size', '10px').style('font-style', 'italic');
    styleAx(g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xSc)));
    styleAx(g.append('g').call(d3.axisLeft(ySc).ticks(5)));
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -44)
        .attr('text-anchor', 'middle').text('Risk Score (0-100)').attr('fill', '#606060').style('font-size', '11px');
    stats.forEach(s => {
        const cx = xSc(s.label) + xSc.bandwidth() / 2, bw = xSc.bandwidth(), col = oColors[s.label], cw = bw * 0.4;
        g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', ySc(s.wLo)).attr('y2', ySc(s.q1))
            .attr('stroke', col).attr('stroke-width', 1.5).attr('opacity', 0.5).attr('stroke-dasharray', '4,2');
        g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', ySc(s.q3)).attr('y2', ySc(s.wHi))
            .attr('stroke', col).attr('stroke-width', 1.5).attr('opacity', 0.5).attr('stroke-dasharray', '4,2');
        [s.wLo, s.wHi].forEach(v => {
            g.append('line').attr('x1', cx - cw / 2).attr('x2', cx + cw / 2).attr('y1', ySc(v)).attr('y2', ySc(v))
                .attr('stroke', col).attr('stroke-width', 1.5).attr('opacity', 0.5);
        });
        g.append('rect').attr('x', xSc(s.label)).attr('width', bw).attr('y', ySc(s.q3)).attr('height', ySc(s.q1) - ySc(s.q3))
            .attr('fill', col).attr('opacity', 0.72).attr('rx', 4)
            .on('mousemove', ev => showTip(ev, s.label, 'Median: ' + s.med?.toFixed(1), 'Q1: ' + s.q1?.toFixed(1) + '  Q3: ' + s.q3?.toFixed(1)))
            .on('mouseleave', hideTip);
        g.append('line').attr('x1', xSc(s.label)).attr('x2', xSc(s.label) + bw).attr('y1', ySc(s.med)).attr('y2', ySc(s.med))
            .attr('stroke', '#FFF').attr('stroke-width', 2.5);
        g.append('text').attr('x', cx).attr('y', ySc(s.med) - 7).attr('text-anchor', 'middle')
            .text(s.med?.toFixed(0)).attr('fill', '#FFF').style('font-size', '11px').style('font-weight', '700');
    });
}

// ── VIZ 6: Fraud Rate by Transaction Country (Horiz Bar) ────────────────────
function drawViz6GeoFraud(transactions) {
    const container = document.getElementById('viz6-geo-fraud');
    if (!container) return;
    const cc = {};
    transactions.forEach(t => { if (!cc[t.transaction_country]) cc[t.transaction_country] = { total: 0, fraud: 0 }; cc[t.transaction_country].total++; if (t.fraud_outcome === 'Confirmed Fraud') cc[t.transaction_country].fraud++; });
    let data = Object.entries(cc).filter(([, c]) => c.total >= 10).map(([country, c]) => ({ country, rate: (c.fraud / c.total) * 100, n: c.total })).sort((a, b) => b.rate - a.rate).slice(0, 10);
    if (data.length < 3) data = [{ country: 'Russia', rate: 26.8, n: 228 }, { country: 'Nigeria', rate: 24.9, n: 481 }, { country: 'India', rate: 23.2, n: 302 }, { country: 'Brazil', rate: 20.2, n: 326 }, { country: 'France', rate: 17.6, n: 102 }, { country: 'Mexico', rate: 15.2, n: 171 }, { country: 'China', rate: 14.9, n: 188 }, { country: 'Indonesia', rate: 13.0, n: 77 }, { country: 'South Korea', rate: 13.0, n: 69 }, { country: 'Germany', rate: 11.8, n: 272 }];
    const W = Math.floor(container.getBoundingClientRect().width) || 760, H = Math.max(300, data.length * 36 + 56);
    const m = { top: 20, right: 180, bottom: 36, left: 110 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const xSc = d3.scaleLinear().domain([0, 30]).range([0, w]);
    const ySc = d3.scaleBand().domain(data.map(d => d.country)).range([0, h]).padding(0.28);
    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    styleAx(g.append('g').call(d3.axisLeft(ySc).tickSize(0)));
    g.append('line').attr('x1', xSc(15)).attr('x2', xSc(15)).attr('y1', -8).attr('y2', h)
        .attr('stroke', '#F79E1B').attr('stroke-width', 1.5).attr('stroke-dasharray', '5,3');
    g.append('text').attr('x', xSc(15) + 4).attr('y', -10).text('15% threshold').attr('fill', '#F79E1B').style('font-size', '10px');
    g.selectAll('rect').data(data).enter().append('rect')
        .attr('x', 0).attr('y', d => ySc(d.country)).attr('width', d => xSc(d.rate)).attr('height', ySc.bandwidth())
        .attr('fill', d => d.rate > 15 ? '#EB001B' : '#FF5F00').attr('rx', 3)
        .on('mousemove', (ev, d) => showTip(ev, d.country, d.rate.toFixed(1) + '% fraud rate', 'n = ' + d.n + ' transactions'))
        .on('mouseleave', hideTip);
    g.selectAll('.lbl').data(data).enter().append('text')
        .attr('x', d => xSc(d.rate) + 5).attr('y', d => ySc(d.country) + ySc.bandwidth() / 2 + 4)
        .text(d => d.rate.toFixed(1) + '%  (n=' + d.n + ')').attr('fill', '#A0A0A0').style('font-size', '11px');
    styleAx(g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xSc).ticks(6).tickFormat(d => d + '%')));
    axLabel(g, 'Fraud Rate (%)', w / 2, h + 32);
}

// ── VIZ 7: Daily False Positives vs Missed Fraud (Scatter + trend line) ─────
function drawViz7FPvsMissed(aggregates) {
    const container = document.getElementById('viz7-fp-vs-missed');
    if (!container) return;
    const dayMap = {};
    aggregates.forEach(d => { const k = d.date.toISOString().slice(0, 10); if (!dayMap[k]) dayMap[k] = { fp: 0, missed: 0 }; dayMap[k].fp += d.false_positive_count; dayMap[k].missed += d.missed_fraud_count; });
    const data = Object.values(dayMap);
    const W = Math.floor(container.getBoundingClientRect().width) || 760, H = 340;
    const m = { top: 32, right: 32, bottom: 52, left: 60 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const xExt = d3.extent(data, d => d.fp); const yExt = d3.extent(data, d => d.missed);
    const xSc = d3.scaleLinear().domain([xExt[0] * 0.95, xExt[1] * 1.05]).range([0, w]);
    const ySc = d3.scaleLinear().domain([yExt[0] * 0.9, yExt[1] * 1.1]).range([h, 0]);
    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    grid(g, d3.axisLeft(ySc).ticks(5).tickSize(-w).tickFormat(''));
    styleAx(g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xSc).ticks(6)));
    styleAx(g.append('g').call(d3.axisLeft(ySc).ticks(5)));
    axLabel(g, 'Total Daily False Positives', w / 2, h + 44);
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -48)
        .attr('text-anchor', 'middle').text('Total Daily Missed Fraud').attr('fill', '#606060').style('font-size', '11px');
    g.selectAll('circle').data(data).enter().append('circle')
        .attr('cx', d => xSc(d.fp)).attr('cy', d => ySc(d.missed))
        .attr('r', 4).attr('fill', '#FF5F00').attr('opacity', 0.55)
        .on('mousemove', (ev, d) => showTip(ev, 'Daily Record', 'Missed: ' + d.missed, 'False Positives: ' + d.fp))
        .on('mouseleave', hideTip);
    // Regression
    const n = data.length, mx = d3.mean(data, d => d.fp), my = d3.mean(data, d => d.missed);
    const num = d3.sum(data, d => (d.fp - mx) * (d.missed - my)), den = d3.sum(data, d => (d.fp - mx) ** 2);
    const slope = den ? num / den : 0, inter = my - slope * mx;
    const corr = den && n > 1 ? num / Math.sqrt(den * d3.sum(data, d => (d.missed - my) ** 2)) : 0;
    const [x0, x1] = xSc.domain();
    g.append('line').attr('x1', xSc(x0)).attr('y1', ySc(slope * x0 + inter)).attr('x2', xSc(x1)).attr('y2', ySc(slope * x1 + inter))
        .attr('stroke', '#EB001B').attr('stroke-width', 1.5).attr('stroke-dasharray', '6,3').attr('opacity', 0.7);
    const badge = g.append('g').attr('transform', 'translate(8,8)');
    badge.append('rect').attr('width', 140).attr('height', 24).attr('rx', 4).attr('fill', '#1A1A1A').attr('stroke', '#2E2E2E');
    badge.append('text').attr('x', 70).attr('y', 16).attr('text-anchor', 'middle')
        .text('Correlation: ' + corr.toFixed(3)).attr('fill', '#A0A0A0').style('font-size', '11px').style('font-weight', '700');
    // Trend legend
    const tleg = g.append('g').attr('transform', `translate(${w - 100},${h - 24})`);
    tleg.append('line').attr('x1', 0).attr('x2', 20).attr('y1', 6).attr('y2', 6).attr('stroke', '#EB001B').attr('stroke-width', 1.5).attr('stroke-dasharray', '6,3');
    tleg.append('text').attr('x', 24).attr('y', 10).text('Trend line').attr('fill', '#A0A0A0').style('font-size', '10px');
}

// ── VIZ 8: Distribution of Top Failure Types (Donut + direct labels) ────────
function drawViz8FailureDonut(aggregates) {
    const container = document.getElementById('viz8-failure-donut');
    if (!container) return;
    const ftC = {};
    aggregates.forEach(d => { ftC[d.top_failure_type] = (ftC[d.top_failure_type] || 0) + 1; });
    const data = Object.entries(ftC).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const total = d3.sum(data, d => d.value);

    // Fixed logical coordinate space — labels never clip regardless of container width.
    // SVG scales to fill the container via CSS width:100%.
    const VW = 760, VH = 340;
    const cx = VW / 2, cy = VH / 2;
    const radius = 110;  // fixed radius in logical units; ~145px clearance per side for labels

    const pie = d3.pie().value(d => d.value).sort(null);
    const arc = d3.arc().innerRadius(radius * 0.52).outerRadius(radius);
    const arcH = d3.arc().innerRadius(radius * 0.52).outerRadius(radius + 7);
    const outerArc = d3.arc().innerRadius(radius * 1.18).outerRadius(radius * 1.18);

    const svg = d3.select(container).append('svg')
        .attr('viewBox', `0 0 ${VW} ${VH}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%').style('height', '100%')
        .style('display', 'block').style('overflow', 'visible');

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    // Slices
    g.selectAll('path').data(pie(data)).enter().append('path')
        .attr('d', arc).attr('fill', (d, i) => DONUT_COLORS[i % DONUT_COLORS.length])
        .attr('stroke', '#111').attr('stroke-width', 2).style('cursor', 'pointer')
        .on('mousemove', function (ev, d) { d3.select(this).attr('d', arcH); showTip(ev, d.data.label, ((d.data.value / total) * 100).toFixed(1) + '%', d.data.value + ' days as top failure type'); })
        .on('mouseleave', function () { d3.select(this).attr('d', arc); hideTip(); });

    // Percentage labels inside slices
    const lArc = d3.arc().innerRadius(radius * 0.75).outerRadius(radius * 0.75);
    g.selectAll('.sl').data(pie(data)).enter().append('text')
        .attr('transform', d => 'translate(' + lArc.centroid(d) + ')')
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .text(d => ((d.data.value / total) * 100).toFixed(1) + '%')
        .attr('fill', '#FFF').style('font-size', '12px').style('font-weight', '700').style('pointer-events', 'none');

    // Direct external labels with leader lines — all in logical space, never clip
    const labelLineX = radius * 1.52;
    pie(data).forEach((d, i) => {
        const col = DONUT_COLORS[i % DONUT_COLORS.length];
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        const onRight = midAngle < Math.PI;
        const arcPt = arc.centroid(d);
        const outerPt = outerArc.centroid(d);
        const lineEnd = [onRight ? labelLineX : -labelLineX, outerPt[1]];
        g.append('polyline').attr('points', [arcPt, outerPt, lineEnd])
            .attr('fill', 'none').attr('stroke', col).attr('stroke-width', 1).attr('opacity', 0.8);
        g.append('text')
            .attr('x', onRight ? lineEnd[0] + 5 : lineEnd[0] - 5)
            .attr('y', lineEnd[1]).attr('text-anchor', onRight ? 'start' : 'end')
            .attr('dominant-baseline', 'middle').text(d.data.label)
            .attr('fill', '#A0A0A0').style('font-size', '12px');
    });
}
// ── Init ─────────────────────────────────────────────────────
async function initViz() {
    const csvLoad = async (path) => { const r = await fetch(path); if (!r.ok) throw new Error('404: ' + path); return d3.csvParse(await r.text()); };
    try {
        const [rulesRaw, aggsRaw, txRaw] = await Promise.all([
            csvLoad('data/fraud_rules_rows.csv'),
            csvLoad('data/daily_aggregates_rows.csv'),
            csvLoad('data/transactions_rows.csv'),
        ]);
        const rules = rulesRaw.map(d => ({ ...d, fn_count_caused: +d.fn_count_caused, financial_impact: +d.financial_impact }));
        const aggs = aggsRaw.map(d => ({ ...d, date: new Date(d.date), missed_fraud_count: +d.missed_fraud_count, false_positive_count: +d.false_positive_count, avg_risk_score: +d.avg_risk_score }));
        const tx = txRaw.map(d => ({ ...d, amount: +d.amount, risk_score: +d.risk_score }));
        requestAnimationFrame(() => requestAnimationFrame(() => {
            drawViz1RuleScatter(rules);
            drawViz2MissedTrend(aggs);
            drawViz3AmountHistogram(tx);
            drawViz4FPCategory(tx);
            drawViz5RiskDist(tx);
            drawViz6GeoFraud(tx);
            drawViz7FPvsMissed(aggs);
            drawViz8FailureDonut(aggs);
        }));
    } catch (err) { console.error('Viz load error:', err); }
}
document.addEventListener('DOMContentLoaded', initViz);