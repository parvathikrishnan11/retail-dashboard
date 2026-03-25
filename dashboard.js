// Helpers
const parseLocalDate = (value) => {
  //date is stored in different format in data without this causes issues in the edge cases (year end and start).
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'string') {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  const dt = new Date(value);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;


// Loading data from json file data.json
async function loadData() {
  const response = await fetch('data.json');
  const D = await response.json();

  D.v1.forEach(d => {
    d.date = monthStart(parseLocalDate(d.date));
  });

  D.crossFilter.forEach(d => {
    d.date = monthStart(parseLocalDate(d.date));
  });

  if (D.v3) {
    D.v3.forEach(d => {
      if (d.date) d.date = monthStart(parseLocalDate(d.date));
    });
  }
  return D;
}

let D;

//getting the top 6 countries and the rest is grouped as "Other"

const top_countries = [
  'United Kingdom',
  'Netherlands',
  'EIRE',
  'Germany',
  'France',
  'Australia'
];

function countryGroup(country) {
  return top_countries.includes(country) ? country : 'Other';
}

//colors chosen from d3 scheme category 10
const colors = d3.scaleOrdinal()
  .domain([...top_countries, 'Other'])
  .range([
    d3.schemeCategory10[0],
    d3.schemeCategory10[1],
    d3.schemeCategory10[2],
    d3.schemeCategory10[3],
    d3.schemeCategory10[4],
    d3.schemeCategory10[5],
    d3.schemeCategory10[7],//to skip pink and get grey for 'Other'

  ]);

function cColor(c) {
  return colors(countryGroup(c));
}

//state for brush window, country click, and dropdown filters
const S = { brush: null, country: null, cFilter: 'all', mFilter: 'all' };

// tooltip
const tt = document.getElementById('tt');

function showTT(e, title, rows) {
  document.getElementById('tt-t').textContent = title;
  document.getElementById('tt-b').innerHTML = rows.map(([k, v]) =>
    `<div class="tt-row"><span class="tt-k">${k}</span><span class="tt-v">${v}</span></div>`
  ).join('');
  tt.classList.add('show');
  mvTT(e);
}

function mvTT(e) {
  tt.style.left = Math.min(e.clientX + 16, window.innerWidth - 250) + 'px';
  tt.style.top = Math.min(e.clientY - 10, window.innerHeight - 180) + 'px';
}

function hideTT() {
  tt.classList.remove('show');
}

// formatters
const fGBP = v => '£' + d3.format(',.0f')(v);
const fK = v =>
  v >= 1e6 ? '£' + d3.format('.2f')(v / 1e6) + 'M'
  : v >= 1000 ? '£' + d3.format('.0f')(v / 1000) + 'k'
  : '£' + d3.format('.0f')(v);

// Filters for view 1
function filteredV1() {
  return D.crossFilter.filter(d => {
    if (S.country && countryGroup(d.country) !== S.country) return false;
    return true;
  });
}

//filtering view 2
function filteredV2() {
  return D.crossFilter.filter(d => {
    if (S.brush) {
      const dMonth = monthStart(d.date);
      const brushStart = monthStart(S.brush[0]);
      const brushEnd = monthStart(S.brush[1]);
      if (dMonth < brushStart || dMonth > brushEnd) return false;
    }
    return true;
  });
}

//filtering view 3 (scatter plot) based on country
function filteredV3() {
  return D.v3.filter(d => {
    const cg = countryGroup(d.country);

    if (S.cFilter && S.cFilter !== 'all') {
      const filterGroup = countryGroup(S.cFilter);
      if (cg !== filterGroup) return false;
    }

    if (S.country && cg !== S.country) return false;

    return true;
  });
}

//filter tthat takes care of dropdown, chart, selected month, and brushed time range.
function filteredAll() {
  return D.crossFilter.filter(d => {
    if (S.cFilter !== 'all' && d.country !== S.cFilter) return false;
    if (S.country && countryGroup(d.country) !== S.country) return false;

    if (S.mFilter !== 'all' && monthKey(d.date) !== S.mFilter) return false;

    if (S.brush) {
      const dMonth = monthStart(d.date);
      const brushStart = monthStart(S.brush[0]);
      const brushEnd = monthStart(S.brush[1]);
      if (dMonth < brushStart || dMonth > brushEnd) return false;
    }

    return true;
  });
}

//filters view 2 based on dropdowns, brush, and selected month.
function filteredV2WithDropdowns() {
  return D.crossFilter.filter(d => {
    if (S.cFilter !== 'all' && d.country !== S.cFilter) return false;
    if (S.mFilter !== 'all' && monthKey(d.date) !== S.mFilter) return false;

    if (S.brush) {
      const dMonth = monthStart(d.date);
      const brushStart = monthStart(S.brush[0]);
      const brushEnd = monthStart(S.brush[1]);
      if (dMonth < brushStart || dMonth > brushEnd) return false;
    }

    return true;
  });
}

//filters view 1 based on dropdowns and selected month (brush doesn't apply to view 1)
function filteredV1WithDropdowns() {
  return D.crossFilter.filter(d => {
    if (S.cFilter !== 'all' && d.country !== S.cFilter) return false;
    if (S.country && countryGroup(d.country) !== S.country) return false;
    if (S.mFilter !== 'all' && monthKey(d.date) !== S.mFilter) return false;
    return true;
  });
}

//filters view 3 based on dropdowns, selected month, and brushed time range.
function filteredV3WithDropdowns() {
  return D.v3.filter(d => {
    const cg = countryGroup(d.country);

    if (S.cFilter !== 'all') {
      const filterGroup = countryGroup(S.cFilter);
      if (cg !== filterGroup) return false;
    }

    if (S.country && cg !== S.country) return false;

    return true;
  });
}

//drawing the line chart for view 1 with brush
function drawV1() {
  const el = document.getElementById('p1');
  const W = el.clientWidth - 52, H = 210;
  const mg = { t: 8, r: 16, b: 38, l: 62 };
  const w = W - mg.l - mg.r, h = H - mg.t - mg.b;

  const svg = d3.select('#sv1').attr('width', W).attr('height', H);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('transform', `translate(${mg.l},${mg.t})`);

  const base = filteredV1();
  const byMonth = d3.rollup(base, v => d3.sum(v, d => d.revenue), d => +monthStart(d.date));
  const allMonths = D.v1.map(d => ({
    date: monthStart(d.date),
    revenue: byMonth.get(+monthStart(d.date)) || 0
  }));

  const x = d3.scaleTime()
    .domain(d3.extent(allMonths, d => d.date))
    .range([0, w]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(allMonths, d => d.revenue) * 1.15 || 1])
    .range([h, 0]);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(''));

  const area = d3.area()
    .x(d => x(d.date))
    .y0(h)
    .y1(d => y(d.revenue))
    .curve(d3.curveCatmullRom.alpha(.5));

  g.append('path')
    .datum(allMonths)
    .attr('fill', 'rgba(27,158,119,.10)')
    .attr('d', area);

  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.revenue))
    .curve(d3.curveCatmullRom.alpha(.5));

  g.append('path')
    .datum(allMonths)
    .attr('fill', 'none')
    .attr('stroke', 'var(--green)')
    .attr('stroke-width', 2)
    .attr('d', line);

  g.selectAll('.dot')
    .data(allMonths)
    .enter()
    .append('circle')
    .attr('class', 'dot')
    .attr('cx', d => x(d.date))
    .attr('cy', d => y(d.revenue))
    .attr('r', 4)
    .attr('fill', 'var(--green)')
    .attr('stroke', 'var(--bg)')
    .attr('stroke-width', 2)
    .style('cursor', 'default')
    .on('mousemove', (e, d) => showTT(e, d3.timeFormat('%B %Y')(d.date), [
      ['Revenue', fGBP(d.revenue)],
      ['Period', d3.timeFormat('%b %Y')(d.date)]
    ]))
    .on('mouseleave', hideTT);

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b '%y")).ticks(d3.timeMonth.every(1)));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(v => '£' + d3.format('.2s')(v)));

  const brush = d3.brushX()
    .extent([[0, 0], [w, h]])
    .on('end', ev => {
      if (!ev.selection) {
        S.brush = null;
      } else {
        let a = monthStart(x.invert(ev.selection[0]));
        let b = monthStart(x.invert(ev.selection[1]));
        if (+a > +b) [a, b] = [b, a];
        S.brush = [a, b];
      }
      updateAll(false);
    });

  const bG = g.append('g').attr('class', 'brush').call(brush);

  bG.select('.selection')
    .attr('fill', 'rgba(27,158,119,.15)')
    .attr('stroke', 'var(--green)')
    .attr('stroke-width', 1);

  bG.select('.overlay').style('cursor', 'crosshair');

  if (S.brush) {
    bG.call(brush.move, [x(monthStart(S.brush[0])), x(monthStart(S.brush[1]))]);
  }
}

// Drawing View 2 the bar chart and clickable for the user to isolate a particular country
function drawV2() {
  const el = document.getElementById('p2');
  const W = el.clientWidth - 52, H = 310;
  const mg = { t: 8, r: 16, b: 90, l: 62 };
  const w = W - mg.l - mg.r, h = H - mg.t - mg.b;

  const svg = d3.select('#sv2').attr('width', W).attr('height', H);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('transform', `translate(${mg.l},${mg.t})`);

  const base = filteredV2();

  const grouped = d3.rollup(
    base,
    v => d3.sum(v, d => d.revenue),
    d => countryGroup(d.country)
  );

  const series = [...top_countries, 'Other'].map(country => [
    country,
    grouped.get(country) || 0
  ]);

  const hasData = series.some(d => d[1] > 0);

  if (!hasData) {
    g.append('text')
      .attr('x', w / 2)
      .attr('y', h / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted)')
      .attr('font-family', 'JetBrains Mono')
      .attr('font-size', 12)
      .text('No data');
    return;
  }

  const x = d3.scaleBand()
    .domain(series.map(d => d[0]))
    .range([0, w])
    .padding(.28);

  const y = d3.scaleLinear()
    .domain([0, d3.max(series, d => d[1]) * 1.12 || 1])
    .range([h, 0]);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''));

  g.selectAll('.bar')
    .data(series)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', d => x(d[0]))
    .attr('y', d => y(d[1]))
    .attr('width', x.bandwidth())
    .attr('height', d => h - y(d[1]))
    .attr('rx', 3)
    .attr('fill', d => cColor(d[0]))
    .attr('opacity', d => {
      if (!S.country) return 1;
      return S.country !== d[0] ? 0.2 : 1;
    })
    .style('cursor', 'pointer')
    .on('click', (e, d) => {
      S.country = S.country === d[0] ? null : d[0];
      updateAll();
    })
    .on('mousemove', (e, d) => showTT(e, d[0], [['Revenue', fGBP(d[1])]]))
    .on('mouseleave', hideTT);

  g.selectAll('.vl')
    .data(series)
    .enter()
    .append('text')
    .attr('class', 'vl')
    .attr('x', d => x(d[0]) + x.bandwidth() / 2)
    .attr('y', d => y(d[1]) - 5)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'JetBrains Mono')
    .attr('font-size', 9)
    .attr('fill', 'var(--muted)')
    .text(d => fK(d[1]));

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-38)')
    .attr('text-anchor', 'end')
    .attr('dx', '-.5em')
    .attr('dy', '.4em');

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(5).tickFormat(v => '£' + d3.format('.2s')(v)));
}

// Drawing Scatter plot for view 3 with size based on the unit price and clickable for user to isolate a particular country //
// tooltip to show details of the product. 
// Also has a legend for the colors representing different countries.
function drawV3() {
  const el = document.getElementById('p3');
  const W = el.clientWidth - 52, H = 310;
  const mg = { t: 8, r: 16, b: 48, l: 76 };
  const w = W - mg.l - mg.r, h = H - mg.t - mg.b;

  const svg = d3.select('#sv3').attr('width', W).attr('height', H);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('transform', `translate(${mg.l},${mg.t})`);

  const data = filteredV3();

  if (!data.length) {
    g.append('text')
      .attr('x', w / 2)
      .attr('y', h / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted)')
      .attr('font-family', 'JetBrains Mono')
      .attr('font-size', 12)
      .text('No data');
    return;
  }

  svg.append('defs')
    .append('clipPath')
    .attr('id', 'clip3')
    .append('rect')
    .attr('width', w)
    .attr('height', h);

  const minQ = d3.min(data, d => d.quantity);
  const maxQ = d3.max(data, d => d.quantity);
  const minR = d3.min(data, d => d.revenue);
  const maxR = d3.max(data, d => d.revenue);
  const maxP = d3.max(data, d => d.unitPrice);

  const x = d3.scaleLog()
    .domain([Math.max(1, minQ * .5), maxQ * 3])
    .range([0, w])
    .nice();

  const y = d3.scaleLog()
    .domain([Math.max(.5, minR * .5), maxR * 3])
    .range([h, 0])
    .nice();

  const r = d3.scaleSqrt().domain([0, maxP]).range([3, 20]);

  const yTickVals = [1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5]
    .filter(v => v >= y.domain()[0] * 0.9 && v <= y.domain()[1] * 1.1);

  const xTickVals = [1, 10, 100, 1e3, 1e4, 1e5]
    .filter(v => v >= x.domain()[0] * 0.9 && v <= x.domain()[1] * 1.1);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).tickValues(yTickVals).tickSize(-w).tickFormat(''));

  g.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickValues(xTickVals).tickSize(-h).tickFormat(''));

  const cg = g.append('g').attr('clip-path', 'url(#clip3)');

  cg.selectAll('.dot')
    .data(data)
    .enter()
    .append('circle')
    .attr('class', 'dot')
    .attr('cx', d => {
      try { return x(d.quantity); } catch { return -99; }
    })
    .attr('cy', d => {
      try { return y(d.revenue); } catch { return -99; }
    })
    .attr('r', d => r(d.unitPrice))
    .attr('fill', d => cColor(d.country))
    .attr('opacity', d => {
      const dotGroup = countryGroup(d.country);
      const cFilterEff = S.cFilter && S.cFilter !== 'all' ? countryGroup(S.cFilter) : null;
      const countryEff = S.country || null;

      if (cFilterEff && dotGroup !== cFilterEff) return .08;
      if (countryEff && dotGroup !== countryEff) return .08;
      return .65;
    })
    .attr('stroke', d => {
      const dotGroup = countryGroup(d.country);
      const cFilterEff = S.cFilter && S.cFilter !== 'all' ? countryGroup(S.cFilter) : null;
      const countryEff = S.country || null;
      const highlighted =
        (cFilterEff && dotGroup === cFilterEff) ||
        (countryEff && dotGroup === countryEff);
      return highlighted ? 'rgba(0,0,0,.2)' : 'transparent';
    })
    .attr('stroke-width', 1)
    .style('cursor', 'pointer')
    .on('mousemove', (e, d) => {
      mvTT(e);
      showTT(
        e,
        d.description.length > 26 ? d.description.slice(0, 26) + '…' : d.description,
        [
          ['Revenue', fGBP(d.revenue)],
          ['Quantity', d3.format(',')(d.quantity)],
          ['Avg Unit Price', '£' + d.unitPrice.toFixed(2)],
          ['Country', countryGroup(d.country)]
        ]
      );
    })
    .on('mouseleave', hideTT)
    .on('click', (e, d) => {
      const group = countryGroup(d.country);
      S.country = S.country === group ? null : group;
      S.cFilter = 'all';
      const fc = document.getElementById('f-country');
      if (fc) fc.value = 'all';
      updateAll();
    });

  const fmtY = v =>
    v >= 1e6 ? '£' + d3.format('.1f')(v / 1e6) + 'M'
    : v >= 1e3 ? '£' + d3.format('.0f')(v / 1e3) + 'k'
    : '£' + v;

  const fmtX = v =>
    v >= 1e6 ? d3.format('.0f')(v / 1e6) + 'M'
    : v >= 1e3 ? d3.format('.0f')(v / 1e3) + 'k'
    : '' + v;

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickValues(xTickVals).tickFormat(fmtX));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).tickValues(yTickVals).tickFormat(fmtY));

  g.append('text')
    .attr('x', w / 2)
    .attr('y', h + 38)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'JetBrains Mono')
    .attr('font-size', 10)
    .attr('fill', 'var(--muted)')
    .text('Quantity (log scale)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', -62)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'JetBrains Mono')
    .attr('font-size', 10)
    .attr('fill', 'var(--muted)')
    .text('Revenue £ (log scale)');

  const leg = document.getElementById('leg3');
  leg.innerHTML = '';

  [...top_countries, 'Other'].forEach(c => {
    const item = document.createElement('div');
    item.className = 'leg-item';

    const cFilterEff = S.cFilter && S.cFilter !== 'all' ? countryGroup(S.cFilter) : null;
    const countryEff = S.country || null;
    const activeFilter = cFilterEff || countryEff;

    if (activeFilter && activeFilter !== c) item.style.opacity = '.35';

    item.innerHTML = `<span class="leg-dot" style="background:${colors(c)}"></span>${c}`;
    item.onclick = () => {
      S.country = S.country === c ? null : c;
      S.cFilter = 'all';
      const fc = document.getElementById('f-country');
      if (fc) fc.value = 'all';
      updateAll();
    };

    leg.appendChild(item);
  });
}

//Base update
function updateAll(redrawV1 = true) {
  if (redrawV1) drawV1();
  drawV2();
  drawV3();
}

//reset function to return to default view
function resetAll() {
  S.brush = null;
  S.country = null;
  updateAll();
}


// Selection info bar
function updateInfo() {
  const el = document.getElementById('sel-info');
  const parts = [];

  if (S.brush) {
    parts.push(`${d3.timeFormat('%b %Y')(monthStart(S.brush[0]))} → ${d3.timeFormat('%b %Y')(monthStart(S.brush[1]))}`);
  }
  if (S.country) parts.push(`${S.country}`);
  if (S.cFilter !== 'all') parts.push(`Country: ${S.cFilter}`);
  if (S.mFilter !== 'all') parts.push(`Month: ${S.mFilter}`);

  if (parts.length) {
    el.textContent = parts.join('  ·  ');
    el.classList.add('show');
  } else {
    el.classList.remove('show');
  }
}


//This function takes the filtered data and groups revenue by month
// then it draws the area + line chart (view 1)
//enables brushing so dragging on the chart updates the selected time range
function drawV1WithDropdowns() {
  const el = document.getElementById('p1');
  const W = el.clientWidth - 52, H = 210;
  const mg = { t: 8, r: 16, b: 38, l: 62 };
  const w = W - mg.l - mg.r, h = H - mg.t - mg.b;

  const svg = d3.select('#sv1').attr('width', W).attr('height', H);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('transform', `translate(${mg.l},${mg.t})`);

  const base = filteredV1WithDropdowns();
  const byMonth = d3.rollup(base, v => d3.sum(v, d => d.revenue), d => +monthStart(d.date));
  const allMonths = D.v1.map(d => ({
    date: monthStart(d.date),
    revenue: byMonth.get(+monthStart(d.date)) || 0
  }));

  const x = d3.scaleTime()
    .domain(d3.extent(allMonths, d => d.date))
    .range([0, w]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(allMonths, d => d.revenue) * 1.15 || 1])
    .range([h, 0]);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(''));

  const area = d3.area()
    .x(d => x(d.date))
    .y0(h)
    .y1(d => y(d.revenue))
    .curve(d3.curveCatmullRom.alpha(.5));

  g.append('path')
    .datum(allMonths)
    .attr('fill', 'rgba(27,158,119,.10)')
    .attr('d', area)
    .attr('opacity', 0)
    .transition()
    .duration(400)
    .attr('opacity', 1);

  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.revenue))
    .curve(d3.curveCatmullRom.alpha(.5));

  const linePath = g.append('path')
    .datum(allMonths)
    .attr('fill', 'none')
    .attr('stroke', 'var(--green)')
    .attr('stroke-width', 2)
    .attr('d', line);

  const totalLen = linePath.node().getTotalLength();
  linePath
    .attr('stroke-dasharray', totalLen)
    .attr('stroke-dashoffset', totalLen)
    .transition()
    .duration(600)
    .ease(d3.easeCubicOut)
    .attr('stroke-dashoffset', 0);

  g.selectAll('.dot')
    .data(allMonths)
    .enter()
    .append('circle')
    .attr('class', 'dot')
    .attr('cx', d => x(d.date))
    .attr('cy', d => y(d.revenue))
    .attr('r', 4)
    .attr('fill', 'var(--green)')
    .attr('stroke', 'var(--bg)')
    .attr('stroke-width', 2)
    .attr('opacity', 0)
    .style('cursor', 'default')
    .on('mousemove', (e, d) => showTT(e, d3.timeFormat('%B %Y')(d.date), [
      ['Revenue', fGBP(d.revenue)],
      ['Period', d3.timeFormat('%b %Y')(d.date)]
    ]))
    .on('mouseleave', hideTT)
    .transition()
    .delay((d, i) => i * 30)
    .duration(200)
    .attr('opacity', 1);

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b '%y")).ticks(d3.timeMonth.every(1)));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(v => '£' + d3.format('.2s')(v)));

  const brush = d3.brushX()
    .extent([[0, 0], [w, h]])
    .on('end', ev => {
      if (!ev.selection) {
        S.brush = null;
      } else {
        let a = monthStart(x.invert(ev.selection[0]));
        let b = monthStart(x.invert(ev.selection[1]));
        if (+a > +b) [a, b] = [b, a];
        S.brush = [a, b];
      }
      updateAllEnhanced(false);
    });

  const bG = g.append('g').attr('class', 'brush').call(brush);

  bG.select('.selection')
    .attr('fill', 'rgba(27,158,119,.15)')
    .attr('stroke', 'var(--green)')
    .attr('stroke-width', 1);

  bG.select('.overlay').style('cursor', 'crosshair');

  if (S.brush) {
    bG.call(brush.move, [x(monthStart(S.brush[0])), x(monthStart(S.brush[1]))]);
  }
}

//This function takes the filtered dataset, aggregates revenue by country groups
// draws an animated bar chart where bars grow upward and support hover and filtering
function drawV2Animated() {
  const el = document.getElementById('p2');
  const W = el.clientWidth - 52, H = 310;
  const mg = { t: 8, r: 16, b: 90, l: 62 };
  const w = W - mg.l - mg.r, h = H - mg.t - mg.b;

  const svg = d3.select('#sv2').attr('width', W).attr('height', H);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('transform', `translate(${mg.l},${mg.t})`);

  const base = filteredV2WithDropdowns();

  const grouped = d3.rollup(
    base,
    v => d3.sum(v, d => d.revenue),
    d => countryGroup(d.country)
  );

  const series = [...top_countries, 'Other'].map(country => [
    country,
    grouped.get(country) || 0
  ]);

  const hasData = series.some(d => d[1] > 0);

  if (!hasData) {
    g.append('text')
      .attr('x', w / 2)
      .attr('y', h / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted)')
      .attr('font-family', 'JetBrains Mono')
      .attr('font-size', 12)
      .text('No data');
    return;
  }

  const x = d3.scaleBand()
    .domain(series.map(d => d[0]))
    .range([0, w])
    .padding(.28);

  const y = d3.scaleLinear()
    .domain([0, d3.max(series, d => d[1]) * 1.12 || 1])
    .range([h, 0]);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''));

  g.selectAll('.bar')
    .data(series)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', d => x(d[0]))
    .attr('y', h)
    .attr('width', x.bandwidth())
    .attr('height', 0)
    .attr('rx', 3)
    .attr('fill', d => cColor(d[0]))
    .attr('opacity', d => {
      if (!S.country) return 1;
      return S.country !== d[0] ? 0.2 : 1;
    })
    .style('cursor', 'pointer')
    .on('click', (e, d) => {
      S.country = S.country === d[0] ? null : d[0];
      updateAllEnhanced();
    })
    .on('mousemove', (e, d) => showTT(e, d[0], [['Revenue', fGBP(d[1])]]))
    .on('mouseleave', hideTT)
    .transition()
    .duration(500)
    .ease(d3.easeCubicOut)
    .attr('y', d => y(d[1]))
    .attr('height', d => h - y(d[1]));

  g.selectAll('.vl')
    .data(series)
    .enter()
    .append('text')
    .attr('class', 'vl')
    .attr('x', d => x(d[0]) + x.bandwidth() / 2)
    .attr('y', d => y(d[1]) - 5)
    .attr('text-anchor', 'middle')
    .attr('font-family', 'JetBrains Mono')
    .attr('font-size', 9)
    .attr('fill', 'var(--muted)')
    .attr('opacity', 0)
    .text(d => fK(d[1]))
    .transition()
    .delay(400)
    .duration(200)
    .attr('opacity', 1);

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-38)')
    .attr('text-anchor', 'end')
    .attr('dx', '-.5em')
    .attr('dy', '.4em');

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(5).tickFormat(v => '£' + d3.format('.2s')(v)));
}

//This is the main refresh function.
//It updates all the visual parts of the dashboard after interaction.
function updateAllEnhanced(redrawV1 = true) {
  if (redrawV1) drawV1WithDropdowns();
  drawV2Animated();
  drawV3();
  updateKPIs();
  updateInfo();
}

// This function clears all filters and restores the dashboard to its default state.
function resetAllEnhanced() {
  S.brush = null;
  S.country = null;
  S.cFilter = 'all';
  S.mFilter = 'all';

  const fc = document.getElementById('f-country');
  const fm = document.getElementById('f-month');

  if (fc) fc.value = 'all';
  if (fm) fm.value = 'all';

  updateAllEnhanced();
}

// Keep external calls working
resetAll = resetAllEnhanced;

// Initialization function to load data, populate dropdowns, and set up event listeners.
async function init() {
  D = await loadData();

  const fc = document.getElementById('f-country');
  const fm = document.getElementById('f-month');

  if (fc) {
    fc.innerHTML = '<option value="all">All</option>';
    D.countries
      .filter(c => c !== 'Unspecified')
      .forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        fc.appendChild(o);
      });

    fc.addEventListener('change', e => {
      S.cFilter = e.target.value;
      S.country = null;
      S.brush = null;
      updateAllEnhanced();
    });
  }

  if (fm) {
    fm.addEventListener('change', e => {
      S.mFilter = e.target.value;
      S.brush = null;
      updateAllEnhanced();
    });
  }

  updateAllEnhanced();
}

window.addEventListener('load', init);
window.addEventListener('resize', () => updateAllEnhanced());
