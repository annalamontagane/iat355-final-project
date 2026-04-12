/**
 * main.js
 * IAT 355 — FraudLens Dashboard
 * Handles: nav switching, CSV data loading, KPI computation, table rendering, D3 chart hooks
 */


// NAVIGATION

function initNav() {
    const navItems = document.querySelectorAll('.nav-item[data-panel]');
    const panels = document.querySelectorAll('.page-panel');
    const topTitle = document.getElementById('topbar-title');

    const titles = {
        overview: 'Fraud Operations — Overview',
        deepdive: 'Fraud Operations — Deep Dive',
        ruledetail: 'Fraud Operations — Rule Detail',
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.panel;

            navItems.forEach(n => n.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            const panel = document.getElementById('panel-' + target);
            if (panel) panel.classList.add('active');
            if (topTitle) topTitle.textContent = titles[target] || 'Dashboard';
        });
    });
}


// DATE STAMP

function initDateStamp() {
    const el = document.getElementById('topbar-date');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}


// CSV LOADING

async function loadData() {
    const csvLoad = async (path) => {
        const res = await fetch(path);
        if (!res.ok) throw new Error('404: ' + path + ' not found. Place your CSV files in a data/ subfolder next to index.html.');
        return d3.csvParse(await res.text());
    };

    const [rulesRaw, aggregatesRaw, transactionsRaw] = await Promise.all([
        csvLoad('data/fraud_rules_rows.csv'),
        csvLoad('data/daily_aggregates_rows.csv'),
        csvLoad('data/transactions_rows.csv'),
    ]);

    // Type-coerce rules
    const rules = rulesRaw.map(d => ({
        ...d,
        fn_count_caused: +d.fn_count_caused,
        financial_impact: +d.financial_impact,
    }));

    // Type-coerce aggregates
    const aggregates = aggregatesRaw.map(d => ({
        ...d,
        date: new Date(d.date),
        missed_fraud_count: +d.missed_fraud_count,
        false_positive_count: +d.false_positive_count,
        avg_risk_score: +d.avg_risk_score,
    }));

    // Type-coerce transactions
    const transactions = transactionsRaw.map(d => ({
        ...d,
        amount: +d.amount,
        risk_score: +d.risk_score,
    }));

    return { rules, aggregates, transactions };
}


// KPI COMPUTATION

function computeKPIs(aggregates) {
    // Last 30 days vs prior 30 days
    const sorted = [...aggregates].sort((a, b) => b.date - a.date);
    const last30 = sorted.slice(0, 30 * 4); // 4 regions per day
    const prior30 = sorted.slice(30 * 4, 60 * 4);

    const sumField = (arr, field) => arr.reduce((s, d) => s + d[field], 0);

    const missed = sumField(last30, 'missed_fraud_count');
    const fp = sumField(last30, 'false_positive_count');
    const avgRisk = (last30.reduce((s, d) => s + d.avg_risk_score, 0) / last30.length).toFixed(1);

    const pMissed = sumField(prior30, 'missed_fraud_count');
    const pFp = sumField(prior30, 'false_positive_count');
    const pRisk = (prior30.reduce((s, d) => s + d.avg_risk_score, 0) / prior30.length).toFixed(1);

    const pctChange = (cur, prev) => prev === 0 ? 0 : (((cur - prev) / prev) * 100).toFixed(1);

    // Top failure type in last 30 days
    const ftCounts = {};
    last30.forEach(d => {
        ftCounts[d.top_failure_type] = (ftCounts[d.top_failure_type] || 0) + 1;
    });
    const topFT = Object.entries(ftCounts).sort((a, b) => b[1] - a[1])[0][0];

    return { missed, fp, avgRisk, pMissed, pFp, pRisk, topFT, pctChange };
}

function renderKPIs(kpis) {
    const fmt = n => n.toLocaleString();

    document.getElementById('kpi-missed-fraud').textContent = fmt(kpis.missed);
    document.getElementById('kpi-false-pos').textContent = fmt(kpis.fp);
    document.getElementById('kpi-risk-score').textContent = kpis.avgRisk;
    document.getElementById('kpi-failure-type').textContent = kpis.topFT;

    const missedDelta = kpis.pctChange(kpis.missed, kpis.pMissed);
    document.getElementById('kpi-missed-delta').textContent = `${missedDelta > 0 ? '+' : ''}${missedDelta}% vs prior 30d`;

    const fpDelta = kpis.pctChange(kpis.fp, kpis.pFp);
    document.getElementById('kpi-fp-delta').textContent = `${fpDelta > 0 ? '+' : ''}${fpDelta}% vs prior 30d`;

    const riskDelta = kpis.pctChange(+kpis.avgRisk, +kpis.pRisk);
    document.getElementById('kpi-risk-delta').textContent = `${riskDelta > 0 ? '+' : ''}${riskDelta}% avg vs prior 30d`;

    document.getElementById('kpi-failure-delta').textContent = 'Most frequent · last 30 days';
}


// FAILURE TYPE GRID

function renderFailureGrid(aggregates) {
    const ftCounts = {};
    let total = 0;
    aggregates.forEach(d => {
        ftCounts[d.top_failure_type] = (ftCounts[d.top_failure_type] || 0) + 1;
        total++;
    });

    const sorted = Object.entries(ftCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const grid = document.getElementById('failure-type-grid');
    if (!grid) return;

    grid.innerHTML = sorted.map(([label, count]) => `
    <div class="failure-item">
      <div class="failure-pct">${((count / total) * 100).toFixed(1)}%</div>
      <div class="failure-label">${label}</div>
    </div>
  `).join('');
}


// RULES TABLE

let rulesData = [];
let transactionsData = [];
let ruleRegionMap = {};
let sortState = { col: 'financial_impact', dir: 'desc' };
let filterPriority = 'all';
let deepDiveSortState = { col: 'financial_impact', dir: 'desc' };
let deepDiveActiveRegion = 'all';

// Maps transaction_country values to their region label
const COUNTRY_REGION = {
    'USA': 'North America', 'Canada': 'North America', 'Mexico': 'North America',
    'UK': 'EMEA', 'France': 'EMEA', 'Germany': 'EMEA', 'Russia': 'EMEA', 'Nigeria': 'EMEA',
    'China': 'APAC', 'India': 'APAC', 'South Korea': 'APAC', 'Indonesia': 'APAC',
    'Brazil': 'LATAM',
};

// Build a map: rule_id -> Set<region> derived from the transactions CSV
function buildRuleRegionMap(transactions) {
    const map = {};
    transactions.forEach(t => {
        if (!t.triggering_rule) return;
        const region = COUNTRY_REGION[t.transaction_country];
        if (!region) return;
        if (!map[t.triggering_rule]) map[t.triggering_rule] = new Set();
        map[t.triggering_rule].add(region);
    });
    return map;
}

function formatImpact(val) {
    if (val >= 1e6) return '$' + (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return '$' + (val / 1e3).toFixed(0) + 'K';
    return '$' + val.toFixed(0);
}

function renderRulesTable(rules) {
    const tbody = document.getElementById('rules-table-body');
    if (!tbody) return;

    let filtered = filterPriority === 'all' ? rules : rules.filter(r => r.fix_priority === filterPriority);

    filtered = [...filtered].sort((a, b) => {
        const av = a[sortState.col], bv = b[sortState.col];
        const num = !isNaN(+av) && !isNaN(+bv);
        let cmp = num ? (+av - +bv) : String(av).localeCompare(String(bv));
        return sortState.dir === 'asc' ? cmp : -cmp;
    });

    tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><span class="rule-id">${r.rule_id}</span></td>
      <td class="text-bold">${r.rule_name}</td>
      <td class="text-muted">${r.category}</td>
      <td class="text-bold ${r.fn_count_caused > 5000 ? 'text-danger' : ''}">${(+r.fn_count_caused).toLocaleString()}</td>
      <td class="text-sm text-muted">${r.failure_type}</td>
      <td class="impact-value ${+r.financial_impact > 800000 ? 'impact-value--high' : ''}">${formatImpact(+r.financial_impact)}</td>
      <td><span class="priority-badge priority-badge--${r.fix_priority.toLowerCase()}">${r.fix_priority}</span></td>
      <td><button class="drill-btn" onclick="goToRuleDetail('${r.rule_id}')">Detail →</button></td>
    </tr>
  `).join('');

    // Update sort arrows
    document.querySelectorAll('#rules-table th[data-col]').forEach(th => {
        th.classList.toggle('sorted', th.dataset.col === sortState.col);
        const arrow = th.querySelector('.sort-arrow');
        if (arrow && th.dataset.col === sortState.col) {
            arrow.textContent = sortState.dir === 'asc' ? '↑' : '↓';
        } else if (arrow) {
            arrow.textContent = '↕';
        }
    });
}

function initTableControls(rules) {
    document.querySelectorAll('#rules-table th[data-col]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortState.col === col) {
                sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.col = col;
                sortState.dir = 'desc';
            }
            renderRulesTable(rules);
        });
    });

    const priorityFilter = document.getElementById('table-priority-filter');
    if (priorityFilter) {
        priorityFilter.addEventListener('change', e => {
            filterPriority = e.target.value;
            renderRulesTable(rules);
        });
    }
}

function goToRuleDetail(ruleId) {
    // Navigate to Rule Detail panel (Level 3)
    document.querySelectorAll('.nav-item[data-panel]').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));

    const nav = document.querySelector('[data-panel="ruledetail"]');
    const panel = document.getElementById('panel-ruledetail');
    if (nav) nav.classList.add('active');
    if (panel) panel.classList.add('active');

    const topTitle = document.getElementById('topbar-title');
    if (topTitle) topTitle.textContent = `Rule Detail — ${ruleId}`;

    renderRuleDetail(ruleId);
}


// RULE DETAIL RENDERER (Level 3)

function renderRuleDetail(ruleId) {
    const rule = rulesData.find(r => r.rule_id === ruleId);

    const emptyEl = document.getElementById('ruledetail-empty');
    const contentEl = document.getElementById('ruledetail-content');
    if (emptyEl) emptyEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    if (!rule) {
        if (contentEl) contentEl.innerHTML = `<div class="chart-card" style="text-align:center;padding:var(--space-2xl);"><div class="text-muted">Rule ${ruleId} not found.</div></div>`;
        return;
    }

    // Update page subtitle
    const subtitleEl = document.getElementById('ruledetail-subtitle');
    if (subtitleEl) subtitleEl.textContent = `${ruleId} — ${rule.rule_name}`;

    // Profile card fields
    document.getElementById('rd-rule-id').textContent = rule.rule_id;
    document.getElementById('rd-rule-name').textContent = rule.rule_name;

    const badge = document.getElementById('rd-priority-badge');
    badge.textContent = rule.fix_priority;
    badge.className = `priority-badge priority-badge--${rule.fix_priority.toLowerCase()}`;

    document.getElementById('rd-category').textContent = rule.category;
    document.getElementById('rd-failure-type').textContent = rule.failure_type;
    document.getElementById('rd-last-edited').textContent = rule.last_edited || '—';

    // Financial impact numbers
    document.getElementById('rd-fn-count').textContent = (+rule.fn_count_caused).toLocaleString();
    document.getElementById('rd-financial-impact').textContent = formatImpact(+rule.financial_impact);

    // Transaction sample — up to 20 rows whose triggering_rule matches
    const matching = transactionsData.filter(t => t.triggering_rule === ruleId).slice(0, 20);
    document.getElementById('rd-tx-count').textContent = matching.length + ' transactions';

    const txTbody = document.getElementById('ruledetail-tx-body');
    if (!txTbody) return;

    if (matching.length === 0) {
        txTbody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center;padding:var(--space-lg);">No transactions for this rule in the loaded sample.</td></tr>`;
        return;
    }

    txTbody.innerHTML = matching.map(t => {
        const outcomeKey = t.fraud_outcome === 'Confirmed Fraud' ? 'high' : t.fraud_outcome === 'Pending Review' ? 'medium' : 'low';
        const riskClass = +t.risk_score >= 70 ? 'text-danger' : +t.risk_score >= 40 ? 'text-warn' : 'text-ok';
        const dateStr = t.date ? String(t.date).slice(0, 10) : '—';
        const amt = (+t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `
    <tr>
      <td><span class="rule-id" style="font-size:10px;">${t.transaction_id}</span></td>
      <td class="text-muted text-sm">${dateStr}</td>
      <td class="text-bold">$${amt}</td>
      <td>${t.merchant_name || '—'}</td>
      <td class="text-muted">${t.transaction_country || '—'}</td>
      <td class="${riskClass} text-bold">${(+t.risk_score).toFixed(0)}</td>
      <td><span class="priority-badge priority-badge--${outcomeKey}">${t.fraud_outcome || '—'}</span></td>
      <td class="text-muted text-sm">${t.flagging_severity || '—'}</td>
    </tr>`;
    }).join('');
}


// DEEP DIVE TABLE — supports region filter + click-to-sort

function renderDeepDiveTable(rules) {
    const tbody = document.getElementById('deepdive-table-body');
    if (!tbody) return;

    // Region filter: a rule passes if any of its transactions come from the selected region
    let filtered = rules;
    if (deepDiveActiveRegion !== 'all') {
        filtered = rules.filter(r => {
            const regions = ruleRegionMap[r.rule_id];
            return regions && regions.has(deepDiveActiveRegion);
        });
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
        const av = a[deepDiveSortState.col], bv = b[deepDiveSortState.col];
        const isNum = !isNaN(+av) && !isNaN(+bv);
        const cmp = isNum ? (+av - +bv) : String(av).localeCompare(String(bv));
        return deepDiveSortState.dir === 'asc' ? cmp : -cmp;
    });

    // Show top 9 for "All Regions", all matching rows for a specific region
    const display = deepDiveActiveRegion === 'all' ? filtered.slice(0, 9) : filtered;

    if (display.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:var(--space-lg);">No rules found for ${deepDiveActiveRegion}.</td></tr>`;
    } else {
        tbody.innerHTML = display.map(r => `
    <tr>
      <td><span class="rule-id">${r.rule_id}</span></td>
      <td class="text-bold">${r.rule_name}</td>
      <td>${(+r.fn_count_caused).toLocaleString()}</td>
      <td class="impact-value">${formatImpact(+r.financial_impact)}</td>
      <td><span class="priority-badge priority-badge--${r.fix_priority.toLowerCase()}">${r.fix_priority}</span></td>
    </tr>
  `).join('');
    }

    // Sync sort arrows on deep dive table headers
    document.querySelectorAll('#deepdive-rules-table th[data-col]').forEach(th => {
        th.classList.toggle('sorted', th.dataset.col === deepDiveSortState.col);
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) {
            arrow.textContent = th.dataset.col === deepDiveSortState.col
                ? (deepDiveSortState.dir === 'asc' ? '↑' : '↓')
                : '↕';
        }
    });
}


// REGION PILLS (Deep Dive) — filters rules table + re-renders box plot

function initRegionPills(rules, transactions) {
    document.querySelectorAll('.region-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.region-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            deepDiveActiveRegion = pill.dataset.region;

            // Re-filter deep dive rules table
            renderDeepDiveTable(rules);

            // Re-render box plot filtered to the selected region
            const container = document.getElementById('risk-dist-chart');
            if (container) {
                container.innerHTML = '';
                const filtered = deepDiveActiveRegion === 'all'
                    ? transactions
                    : transactions.filter(t => COUNTRY_REGION[t.transaction_country] === deepDiveActiveRegion);
                drawRiskScoreBoxPlot(filtered);
            }
        });
    });
}


// DEEP DIVE TABLE — click-to-sort on column headers

function initDeepDiveTableSort(rules) {
    document.querySelectorAll('#deepdive-rules-table th[data-col]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (deepDiveSortState.col === col) {
                deepDiveSortState.dir = deepDiveSortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                deepDiveSortState.col = col;
                deepDiveSortState.dir = 'desc';
            }
            renderDeepDiveTable(rules);
        });
    });
}


// D3 CHART: MISSED FRAUD TREND (Level 1)

function drawMissedFraudTrend(aggregates) {
    const container = document.getElementById('missed-fraud-chart');
    if (!container) return;

    const W = Math.floor(container.getBoundingClientRect().width) || 400;
    const H = container.clientHeight || 280;
    const margin = { top: 20, right: 80, bottom: 40, left: 44 };
    const width = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    // Last 60 days, aggregate across regions
    const sorted = [...aggregates].sort((a, b) => a.date - b.date);
    const dateMap = {};
    sorted.forEach(d => {
        const key = d.date.toISOString().slice(0, 10);
        if (!dateMap[key]) dateMap[key] = { date: d.date, total: 0 };
        dateMap[key].total += d.missed_fraud_count;
    });
    const daily = Object.values(dateMap).slice(-60);

    // Regions for multi-line
    const regions = ['North America', 'EMEA', 'APAC', 'LATAM'];
    // Distinct, clearly separated colors matching assignment figure
    const regionColors = {
        'North America': '#CC1414',   // deep red
        'EMEA': '#E07B00',   // amber-orange
        'APAC': '#C8A200',   // gold-yellow
        'LATAM': '#2E86DE',   // clear blue
    };

    // Build per-region data
    const regionData = {};
    regions.forEach(r => { regionData[r] = []; });
    sorted.forEach(d => {
        if (regionData[d.region] !== undefined) {
            regionData[d.region].push({ date: d.date, value: d.missed_fraud_count });
        }
    });
    regions.forEach(r => {
        regionData[r] = regionData[r].slice(-60);
    });

    const allValues = regions.flatMap(r => regionData[r].map(d => d.value));
    const allDates = regionData['North America'].map(d => d.date);

    const xScale = d3.scaleTime().domain(d3.extent(allDates)).range([0, width]);
    const yScale = d3.scaleLinear().domain([0, d3.max(allValues) * 1.1]).range([height, 0]);

    const svg = d3.select(container)
        .append('svg')
        .attr('width', W).attr('height', H);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid lines
    g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(yScale).ticks(5).tickSize(-width).tickFormat(''))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('line').attr('stroke', '#2E2E2E').attr('stroke-dasharray', '3,3'));

    // Axes
    g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.timeFormat('%b %d')))
        .call(g => g.select('.domain').remove())
        .selectAll('text')
        .attr('fill', '#606060')
        .style('font-size', '11px');

    g.append('g')
        .call(d3.axisLeft(yScale).ticks(5))
        .call(g => g.select('.domain').remove())
        .selectAll('text')
        .attr('fill', '#606060')
        .style('font-size', '11px');

    // Lines per region
    const line = d3.line().x(d => xScale(d.date)).y(d => yScale(d.value)).curve(d3.curveCatmullRom);

    regions.forEach(region => {
        const data = regionData[region];
        if (!data || data.length === 0) return;

        g.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', regionColors[region])
            .attr('stroke-width', 2)
            .attr('opacity', 0.9)
            .attr('d', line);
    });

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${W - margin.right + 8}, ${margin.top})`);
    regions.forEach((r, i) => {
        const row = legend.append('g').attr('transform', `translate(0, ${i * 18})`);
        row.append('line').attr('x1', 0).attr('x2', 14).attr('y1', 5).attr('y2', 5)
            .attr('stroke', regionColors[r]).attr('stroke-width', 2);
        row.append('text').attr('x', 18).attr('y', 9)
            .text(r === 'North America' ? 'NA' : r)
            .attr('fill', '#A0A0A0').style('font-size', '10px');
    });
}


// D3 CHART: RULE PERFORMANCE SCATTER (Level 1)

function drawRulePerformanceScatter(rules) {
    const container = document.getElementById('rule-perf-chart');
    if (!container) return;

    const W = Math.floor(container.getBoundingClientRect().width) || 400;
    const H = container.clientHeight || 280;
    const margin = { top: 20, right: 24, bottom: 44, left: 60 };
    const width = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    const priorityColors = { 'High': '#EB001B', 'Medium': '#FF5F00', 'Low': '#F79E1B' };

    const xScale = d3.scaleLinear()
        .domain([0, d3.max(rules, d => d.fn_count_caused) * 1.1])
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(rules, d => d.financial_impact) * 1.1])
        .range([height, 0]);

    const svg = d3.select(container)
        .append('svg').attr('width', W).attr('height', H);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid
    g.append('g')
        .call(d3.axisLeft(yScale).ticks(5).tickSize(-width).tickFormat(''))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('line').attr('stroke', '#2E2E2E').attr('stroke-dasharray', '3,3'));

    // X axis
    g.append('g').attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => (d / 1000).toFixed(0) + 'K'))
        .call(g => g.select('.domain').remove())
        .selectAll('text').attr('fill', '#606060').style('font-size', '11px');

    // Y axis
    g.append('g')
        .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => '$' + (d / 1000).toFixed(0) + 'K'))
        .call(g => g.select('.domain').remove())
        .selectAll('text').attr('fill', '#606060').style('font-size', '11px');

    // Axis labels
    g.append('text').attr('class', 'axis-title')
        .attr('x', width / 2).attr('y', height + 36)
        .attr('text-anchor', 'middle').text('False Negatives (Missed Fraud Count)')
        .attr('fill', '#606060').style('font-size', '11px');

    g.append('text').attr('class', 'axis-title')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2).attr('y', -50)
        .attr('text-anchor', 'middle').text('Financial Impact ($K)')
        .attr('fill', '#606060').style('font-size', '11px');

    // Dots
    const tooltip = document.getElementById('chart-tooltip');
    const ttLabel = document.getElementById('tt-label');
    const ttValue = document.getElementById('tt-value');
    const ttSub = document.getElementById('tt-sub');

    g.selectAll('circle').data(rules).enter().append('circle')
        .attr('cx', d => xScale(d.fn_count_caused))
        .attr('cy', d => yScale(d.financial_impact))
        .attr('r', 7)
        .attr('fill', d => priorityColors[d.fix_priority] || '#888')
        .attr('opacity', 0.85)
        .attr('stroke', '#111')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mousemove', (event, d) => {
            ttLabel.textContent = `${d.rule_id} — ${d.rule_name}`;
            ttValue.textContent = formatImpact(d.financial_impact);
            ttSub.textContent = `${d.fn_count_caused.toLocaleString()} missed · ${d.fix_priority} priority`;
            tooltip.style.left = (event.clientX + 12) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
            tooltip.classList.add('visible');
        })
        .on('mouseleave', () => tooltip.classList.remove('visible'));

    // Rule ID labels for outliers
    g.selectAll('.dot-label').data(rules.filter(d => d.financial_impact > 700000 || d.fn_count_caused > 7000))
        .enter().append('text')
        .attr('x', d => xScale(d.fn_count_caused) + 9)
        .attr('y', d => yScale(d.financial_impact) + 4)
        .text(d => d.rule_id)
        .attr('fill', '#A0A0A0')
        .style('font-size', '10px');

    // Priority legend (bottom-right)
    const legendData = [['High', '#EB001B'], ['Medium', '#FF5F00'], ['Low', '#F79E1B']];
    const legend = g.append('g').attr('transform', `translate(${width - 90}, ${height - 52})`);
    legend.append('rect').attr('width', 92).attr('height', 54).attr('rx', 4)
        .attr('fill', '#111').attr('opacity', 0.75);
    legendData.forEach(([label, color], i) => {
        const row = legend.append('g').attr('transform', `translate(8, ${10 + i * 15})`);
        row.append('circle').attr('cx', 5).attr('cy', 5).attr('r', 5).attr('fill', color).attr('opacity', 0.9);
        row.append('text').attr('x', 14).attr('y', 9)
            .text(label + ' Priority').attr('fill', '#A0A0A0').style('font-size', '10px');
    });
}


// D3 CHART: FALSE POSITIVES BY CATEGORY (Level 1)

function drawFPCategoryChart(transactions) {
    const container = document.getElementById('fp-category-chart');
    if (!container) return;

    // Count false positives (legitimate transactions that have a triggering_rule)
    const fpByCategory = {};

    // Use rules data context: category mapping by rule prefix
    const categoryMap = {
        'VD': 'Device', 'ND': 'Device', 'DV': 'Device',
        'CA': 'Card-Not-Present', 'CN': 'Card-Not-Present',
        'IP': 'IP/Geo',
        'BN': 'BIN',
        'CR': 'Cross-Border',
        'GE': 'Geo-Velocity',
        'TP': 'Velocity',
        'AT': 'Account',
        'ML': 'ML-Model',
    };

    transactions.forEach(t => {
        if (t.fraud_outcome === 'Legitimate' && t.triggering_rule) {
            const prefix = t.triggering_rule.slice(0, 2);
            const cat = categoryMap[prefix] || 'Other';
            fpByCategory[cat] = (fpByCategory[cat] || 0) + 1;
        }
    });

    const data = Object.entries(fpByCategory)
        .map(([cat, count]) => ({ cat, count }))
        .sort((a, b) => b.count - a.count);

    if (data.length === 0) {
        container.innerHTML = `<div class="chart-placeholder">
      <div class="chart-placeholder-icon">⊘</div>
      <div class="chart-placeholder-label">No FP data in sample</div>
    </div>`;
        return;
    }

    const W = Math.floor(container.getBoundingClientRect().width) || 400;
    const H = container.clientHeight || 300;
    // Tighter margins — shorter category labels fit in 90px, value labels in 40px
    const margin = { top: 12, right: 40, bottom: 12, left: 100 };
    const width = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    const xScale = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).range([0, width]);
    const yScale = d3.scaleBand().domain(data.map(d => d.cat)).range([0, height]).padding(0.25);

    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Y axis — slightly smaller font so labels fit the narrower column
    g.append('g').call(d3.axisLeft(yScale).tickSize(0))
        .call(g => g.select('.domain').remove())
        .selectAll('text').attr('fill', '#A0A0A0').style('font-size', '10px');

    // Bars
    g.selectAll('rect').data(data).enter().append('rect')
        .attr('x', 0)
        .attr('y', d => yScale(d.cat))
        .attr('width', d => xScale(d.count))
        .attr('height', yScale.bandwidth())
        .attr('fill', '#FF5F00')
        .attr('rx', 3);

    // Value labels
    g.selectAll('.bar-label').data(data).enter().append('text')
        .attr('x', d => xScale(d.count) + 5)
        .attr('y', d => yScale(d.cat) + yScale.bandwidth() / 2 + 4)
        .text(d => d.count)
        .attr('fill', '#A0A0A0')
        .style('font-size', '11px').style('font-weight', '700');
}


// D3 CHART: FAILURE TYPE DONUT (Level 1)

function drawFailureDonut(aggregates) {
    const container = document.getElementById('failure-donut-chart');
    if (!container) return;

    const ftCounts = {};
    aggregates.forEach(d => {
        ftCounts[d.top_failure_type] = (ftCounts[d.top_failure_type] || 0) + 1;
    });

    const data = Object.entries(ftCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);

    const colors = ['#EB001B', '#FF5F00', '#F79E1B', '#FF8C42', '#C0392B'];
    const total = d3.sum(data, d => d.value);

    // Fixed logical coordinate space — wide enough for labels on both sides.
    // VW is extra wide so right-side labels ("Detection window too narrow") never clip.
    // Center is shifted slightly left so right labels have more room than left.
    const VW = 640;   // wide logical canvas — scales down via CSS to fit container
    const VH = 320;   // tall enough for 300px container
    const cx = 290;  // shifted left of center — right side gets 350px, left gets 290px
    const cy = VH / 2;
    const radius = 95; // slightly smaller so labels have generous clearance

    const pie = d3.pie().value(d => d.value).sort(null);
    const arc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius);
    const arcHover = d3.arc().innerRadius(radius * 0.5).outerRadius(radius + 5);
    // Anchor arc for leader line midpoints
    const outerArc = d3.arc().innerRadius(radius * 1.18).outerRadius(radius * 1.18);

    const tooltip = document.getElementById('chart-tooltip');
    const ttLabel = document.getElementById('tt-label');
    const ttValue = document.getElementById('tt-value');
    const ttSub = document.getElementById('tt-sub');

    // SVG fills container width, preserves aspect ratio, never clips content
    const svg = d3.select(container).append('svg')
        .attr('viewBox', `0 0 ${VW} ${VH}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', '100%')
        .style('display', 'block')
        .style('overflow', 'visible');

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    // Slices
    g.selectAll('path').data(pie(data)).enter().append('path')
        .attr('d', arc)
        .attr('fill', (d, i) => colors[i % colors.length])
        .attr('stroke', '#111').attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mousemove', function (event, d) {
            d3.select(this).attr('d', arcHover);
            ttLabel.textContent = d.data.label;
            ttValue.textContent = ((d.data.value / total) * 100).toFixed(1) + '%';
            ttSub.textContent = d.data.value + ' days as top failure type';
            tooltip.style.left = (event.clientX + 12) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
            tooltip.classList.add('visible');
        })
        .on('mouseleave', function () {
            d3.select(this).attr('d', arc);
            tooltip.classList.remove('visible');
        });

    // Percentage labels inside slices
    g.selectAll('.pct-label').data(pie(data)).enter().append('text')
        .attr('transform', d => 'translate(' + arc.centroid(d) + ')')
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .text(d => ((d.data.value / total) * 100).toFixed(1) + '%')
        .attr('fill', '#FFF').style('font-size', '11px').style('font-weight', '700')
        .style('pointer-events', 'none');

    // Direct external labels with leader lines
    // All coordinates are in the logical 500×260 space — never clip.
    const labelLineX = radius * 1.55;   // horizontal endpoint, fits in wider VW canvas
    pie(data).forEach((d, i) => {
        const col = colors[i % colors.length];
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        const onRight = midAngle < Math.PI;

        const arcPt = arc.centroid(d);
        const outerPt = outerArc.centroid(d);
        const lineEnd = [onRight ? labelLineX : -labelLineX, outerPt[1]];

        g.append('polyline')
            .attr('points', [arcPt, outerPt, lineEnd])
            .attr('fill', 'none').attr('stroke', col).attr('stroke-width', 1).attr('opacity', 0.7);

        g.append('text')
            .attr('x', onRight ? lineEnd[0] + 5 : lineEnd[0] - 5)
            .attr('y', lineEnd[1])
            .attr('text-anchor', onRight ? 'start' : 'end')
            .attr('dominant-baseline', 'middle')
            .text(d.data.label)
            .attr('fill', '#A0A0A0').style('font-size', '11px');
    });
}


// D3 CHART: RISK SCORE BOX PLOT (Level 2)

function drawRiskScoreBoxPlot(transactions) {
    const container = document.getElementById('risk-dist-chart');
    if (!container) return;

    const outcomes = ['Legitimate', 'Pending Review', 'Confirmed Fraud'];
    const outcomeColors = {
        'Legitimate': '#22C55E',
        'Pending Review': '#FF5F00',
        'Confirmed Fraud': '#EB001B',
    };

    const groups = {};
    outcomes.forEach(o => { groups[o] = []; });
    transactions.forEach(t => {
        if (groups[t.fraud_outcome] !== undefined) {
            groups[t.fraud_outcome].push(t.risk_score);
        }
    });

    const boxStats = outcomes.map(o => {
        const vals = groups[o].sort(d3.ascending);
        const q1 = d3.quantile(vals, 0.25);
        const med = d3.quantile(vals, 0.5);
        const q3 = d3.quantile(vals, 0.75);
        const iqr = q3 - q1;
        return {
            label: o,
            min: Math.max(0, d3.min(vals)),
            q1, med, q3,
            max: Math.min(100, d3.max(vals)),
            whiskerLo: Math.max(0, q1 - 1.5 * iqr),
            whiskerHi: Math.min(100, q3 + 1.5 * iqr),
        };
    });

    const W = Math.floor(container.getBoundingClientRect().width) || 400;
    const H = container.clientHeight || 280;
    const margin = { top: 24, right: 24, bottom: 50, left: 48 };
    const width = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    const xScale = d3.scaleBand().domain(outcomes).range([0, width]).padding(0.4);
    const yScale = d3.scaleLinear().domain([0, 100]).range([height, 0]);

    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid
    g.append('g')
        .call(d3.axisLeft(yScale).ticks(5).tickSize(-width).tickFormat(''))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('line').attr('stroke', '#2E2E2E').attr('stroke-dasharray', '3,3'));

    // Grey zone highlight (30–55)
    g.append('rect')
        .attr('x', 0).attr('width', width)
        .attr('y', yScale(55)).attr('height', yScale(30) - yScale(55))
        .attr('fill', 'rgba(255,255,255,0.04)');
    g.append('text')
        .attr('x', width - 4).attr('y', yScale(42.5))
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .text('Grey Zone').attr('fill', '#606060').style('font-size', '10px');

    // Axes
    g.append('g').attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d => d === 'Pending Review' ? 'Pending' : d))
        .call(g => g.select('.domain').remove())
        .selectAll('text').attr('fill', '#A0A0A0').style('font-size', '11px');

    g.append('g').call(d3.axisLeft(yScale).ticks(5))
        .call(g => g.select('.domain').remove())
        .selectAll('text').attr('fill', '#606060').style('font-size', '11px');

    // Box plots
    boxStats.forEach(stat => {
        const cx = xScale(stat.label) + xScale.bandwidth() / 2;
        const bw = xScale.bandwidth();
        const col = outcomeColors[stat.label];

        // Whiskers
        g.append('line')
            .attr('x1', cx).attr('x2', cx)
            .attr('y1', yScale(stat.whiskerLo)).attr('y2', yScale(stat.whiskerHi))
            .attr('stroke', col).attr('stroke-width', 1.5).attr('opacity', 0.5);

        // Box
        g.append('rect')
            .attr('x', xScale(stat.label))
            .attr('width', bw)
            .attr('y', yScale(stat.q3))
            .attr('height', yScale(stat.q1) - yScale(stat.q3))
            .attr('fill', col).attr('opacity', 0.7)
            .attr('rx', 3);

        // Median line
        g.append('line')
            .attr('x1', xScale(stat.label)).attr('x2', xScale(stat.label) + bw)
            .attr('y1', yScale(stat.med)).attr('y2', yScale(stat.med))
            .attr('stroke', '#FFF').attr('stroke-width', 2);
    });
}


// CHART IDS — containers that D3 renders into (used for clear+redraw)

const CHART_CONTAINER_IDS = [
    'missed-fraud-chart',
    'rule-perf-chart',
    'fp-category-chart',
    'failure-donut-chart',
    'risk-dist-chart',
];

function clearChartContainers() {
    CHART_CONTAINER_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

function drawAllCharts(aggregates, rules, transactions) {
    clearChartContainers();
    drawMissedFraudTrend(aggregates);
    drawRulePerformanceScatter(rules);
    drawFPCategoryChart(transactions);
    drawFailureDonut(aggregates);
    drawRiskScoreBoxPlot(transactions);
}


// MAIN INIT

async function init() {
    initNav();
    initDateStamp();

    try {
        const { rules, aggregates, transactions } = await loadData();
        rulesData = rules;
        transactionsData = transactions;
        ruleRegionMap = buildRuleRegionMap(transactions);

        const kpis = computeKPIs(aggregates);
        renderKPIs(kpis);
        renderFailureGrid(aggregates);
        renderRulesTable(rules);
        renderDeepDiveTable(rules);
        initTableControls(rules);
        initRegionPills(rules, transactions);
        initDeepDiveTableSort(rules);

        // Two frames so layout is fully painted before measuring clientWidth
        requestAnimationFrame(() => requestAnimationFrame(() => {
            drawAllCharts(aggregates, rules, transactions);
        }));

        // Resize handling — debounced, clears and redraws all charts
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                requestAnimationFrame(() => drawAllCharts(aggregates, rules, transactions));
            }, 150);
        });

    } catch (err) {
        console.error('Data load failed:', err);
        document.querySelectorAll('.kpi-value').forEach(el => {
            if (el.textContent === '—') el.textContent = 'N/A';
        });
    }
}

document.addEventListener('DOMContentLoaded', init);