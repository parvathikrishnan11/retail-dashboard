//loading data from json
async function loadData() {
  const response = await fetch('data.json');
  const D = await response.json();
  D.v1.forEach(d => d.date = new Date(d.date));
  D.crossFilter.forEach(d => d.date = new Date(d.date));
  return D;
}

let D;

//top7 countries
const top_seven = ['United Kingdom','Netherlands','EIRE','Germany','France','Australia','Spain'];
const colors = d3.scaleOrdinal()
  .domain([...top_seven
  , 'Other'])
  .range(['#4af0c4','#f0a84a','#a84af0','#f05a8a','#4a9af0','#f0e84a','#88c0d0','#6b7394']);

function cColor(c) { 
  return top_seven
.includes(c) ? colors(c) : colors('Other'); 
}

//state for brush window
const S = { brush: null, country: null };

//tooltip
const tt = document.getElementById('tt');
function showTT(e, title, rows) {
  document.getElementById('tt-t').textContent = title;
  document.getElementById('tt-b').innerHTML = rows.map(([k,v]) =>
    `<div class="tt-row"><span class="tt-k">${k}</span><span class="tt-v">${v}</span></div>`).join('');
  tt.classList.add('show'); mvTT(e);
}
function mvTT(e) {
  tt.style.left = Math.min(e.clientX+16, window.innerWidth-250)+'px';
  tt.style.top  = Math.min(e.clientY-10, window.innerHeight-180)+'px';
}
function hideTT() { tt.classList.remove('show'); }

//formatters
const fGBP = v => '£'+d3.format(',.0f')(v);
const fK   = v => v>=1e6 ? '£'+d3.format('.2f')(v/1e6)+'M' : v>=1000 ? '£'+d3.format('.0f')(v/1000)+'k' : '£'+d3.format('.0f')(v);

function filteredV1() {
  // Time series: country click only (brush lives on v1 itself)
  return D.crossFilter.filter(d => {
    if (S.country && d.country !== S.country) return false;
    return true;
  });
}

function filteredV2() {
  // Bar chart: brush only (country shown via opacity)
  return D.crossFilter.filter(d => {
    if (S.brush && (d.date < S.brush[0] || d.date > S.brush[1])) return false;
    return true;
  });
}

function filteredV3() {
  // Scatter: country click only
  return D.v3.filter(d => {
    if (S.country) {
      const match = top_seven
    .includes(S.country) ? d.country === S.country : d.country === 'Other';
      if (!match) return false;
    }
    return true;
  });
}

// Drawing View 1
function drawV1() {
  const el = document.getElementById('p1');
  const W = el.clientWidth - 52, H = 210;
  const mg = {t:8,r:16,b:38,l:62};
  const w = W-mg.l-mg.r, h = H-mg.t-mg.b;

  const svg = d3.select('#sv1').attr('width',W).attr('height',H);
  svg.selectAll('*').remove();
  const g = svg.append('g').attr('transform',`translate(${mg.l},${mg.t})`);

  const base = filteredV1();
  const byMonth = d3.rollup(base, v=>d3.sum(v,d=>d.revenue), d=>d.date.getTime());
  // Show all months from D.v1 as baseline
  const allMonths = D.v1.map(d => ({ date: d.date, revenue: byMonth.get(d.date.getTime()) || 0 }));

  const x = d3.scaleTime().domain(d3.extent(allMonths,d=>d.date)).range([0,w]);
  const y = d3.scaleLinear().domain([0, d3.max(allMonths,d=>d.revenue)*1.15]).range([h,0]);

  g.append('g').attr('class','grid')
    .call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(''));

  const area = d3.area().x(d=>x(d.date)).y0(h).y1(d=>y(d.revenue)).curve(d3.curveCatmullRom.alpha(.5));
  g.append('path').datum(allMonths).attr('fill','rgba(74,240,196,.07)').attr('d',area);

  const line = d3.line().x(d=>x(d.date)).y(d=>y(d.revenue)).curve(d3.curveCatmullRom.alpha(.5));
  g.append('path').datum(allMonths).attr('fill','none').attr('stroke','var(--accent)').attr('stroke-width',2).attr('d',line);

  g.selectAll('.dot').data(allMonths).enter().append('circle')
    .attr('cx',d=>x(d.date)).attr('cy',d=>y(d.revenue))
    .attr('r',4).attr('fill','var(--accent)').attr('stroke','var(--bg)').attr('stroke-width',2)
    .style('cursor','default')
    .on('mousemove',(e,d)=>showTT(e,d3.timeFormat('%B %Y')(d.date),[
      ['Revenue',fGBP(d.revenue)],['Period',d3.timeFormat('%b %Y')(d.date)]]))
    .on('mouseleave',hideTT);

  g.append('g').attr('class','axis').attr('transform',`translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b \'%y')).ticks(d3.timeMonth.every(1)));
  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(v=>'£'+d3.format('.2s')(v)));

  const brush = d3.brushX().extent([[0,0],[w,h]])
    .on('end', ev => {
      S.brush = ev.selection ? [x.invert(ev.selection[0]), x.invert(ev.selection[1])] : null;
      updateAll(false); // don't redraw v1 to avoid brush loop
    });

  const bG = g.append('g').attr('class','brush').call(brush);
  bG.select('.selection').attr('fill','rgba(74,240,196,.15)').attr('stroke','var(--accent)').attr('stroke-width',1);
  bG.select('.overlay').style('cursor','crosshair');

  if (S.brush) bG.call(brush.move, [x(S.brush[0]), x(S.brush[1])]);
}

//Drawing View 2
function drawV2() {
  const el = document.getElementById('p2');
  const W = el.clientWidth - 52, H = 310;
  const mg = {t:8,r:16,b:90,l:62};
  const w = W-mg.l-mg.r, h = H-mg.t-mg.b;

  const svg = d3.select('#sv2').attr('width',W).attr('height',H);
  svg.selectAll('*').remove();
  const g = svg.append('g').attr('transform',`translate(${mg.l},${mg.t})`);

  const base = filteredV2();
  const byC = d3.rollup(base, v=>d3.sum(v,d=>d.revenue), d=>d.country);
  const series = [...byC.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);

  if (!series.length) {
    g.append('text').attr('x',w/2).attr('y',h/2).attr('text-anchor','middle')
      .attr('fill','var(--muted)').attr('font-family','DM Mono').attr('font-size',12).text('No data');
    return;
  }

  const x = d3.scaleBand().domain(series.map(d=>d[0])).range([0,w]).padding(.28);
  const y = d3.scaleLinear().domain([0,d3.max(series,d=>d[1])*1.12]).range([h,0]);

  g.append('g').attr('class','grid')
    .call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''));

  g.selectAll('.bar').data(series).enter().append('rect')
    .attr('x',d=>x(d[0])).attr('y',d=>y(d[1]))
    .attr('width',x.bandwidth()).attr('height',d=>h-y(d[1])).attr('rx',3)
    .attr('fill',d=>cColor(d[0]))
    .attr('opacity',d=>S.country && S.country!==d[0] ? .2 : 1)
    .style('cursor','pointer')
    .on('click',(e,d)=>{ S.country = S.country===d[0] ? null : d[0]; updateAll(); })
    .on('mousemove',(e,d)=>showTT(e,d[0],[['Revenue',fGBP(d[1])],['Click to isolate','→']]))
    .on('mouseleave',hideTT);

  // Value labels
  g.selectAll('.vl').data(series).enter().append('text')
    .attr('x',d=>x(d[0])+x.bandwidth()/2).attr('y',d=>y(d[1])-5)
    .attr('text-anchor','middle').attr('font-family','DM Mono').attr('font-size',9).attr('fill','var(--muted)')
    .text(d=>fK(d[1]));

  g.append('g').attr('class','axis').attr('transform',`translate(0,${h})`)
    .call(d3.axisBottom(x)).selectAll('text')
    .attr('transform','rotate(-38)').attr('text-anchor','end').attr('dx','-.5em').attr('dy','.4em');

  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y).ticks(5).tickFormat(v=>'£'+d3.format('.2s')(v)));
}

//Drawing Scatter plot
function drawV3() {
  const el = document.getElementById('p3');
  const W = el.clientWidth - 52, H = 310;
  const mg = {t:8,r:16,b:48,l:76};
  const w = W-mg.l-mg.r, h = H-mg.t-mg.b;

  const svg = d3.select('#sv3').attr('width',W).attr('height',H);
  svg.selectAll('*').remove();
  const g = svg.append('g').attr('transform',`translate(${mg.l},${mg.t})`);

  const data = filteredV3();
  if (!data.length) {
    g.append('text').attr('x',w/2).attr('y',h/2).attr('text-anchor','middle')
      .attr('fill','var(--muted)').attr('font-family','DM Mono').attr('font-size',12).text('No data');
    return;
  }

  svg.append('defs').append('clipPath').attr('id','clip3')
    .append('rect').attr('width',w).attr('height',h);

  const minQ = d3.min(data,d=>d.quantity), maxQ = d3.max(data,d=>d.quantity);
  const minR = d3.min(data,d=>d.revenue), maxR = d3.max(data,d=>d.revenue);
  const maxP = d3.max(data,d=>d.unitPrice);

  const x = d3.scaleLog().domain([Math.max(1,minQ*.8), maxQ*1.5]).range([0,w]).nice();
  const y = d3.scaleLog().domain([Math.max(.5,minR*.8), maxR*1.5]).range([h,0]).nice();
  // sqrt scale for bubble size (Stevens' Law correction)
  const r = d3.scaleSqrt().domain([0, maxP]).range([3,20]);

  // Only show ticks within data range to avoid clutter
  const yTickVals = [1e3,2e3,5e3,1e4,2e4,5e4,1e5,2e5].filter(v => v >= y.domain()[0]*0.9 && v <= y.domain()[1]*1.1);
  const xTickVals = [1,10,100,1e3,1e4,1e5].filter(v => v >= x.domain()[0]*0.9 && v <= x.domain()[1]*1.1);

  g.append('g').attr('class','grid').call(d3.axisLeft(y).tickValues(yTickVals).tickSize(-w).tickFormat(''));
  g.append('g').attr('class','grid').attr('transform',`translate(0,${h})`)
    .call(d3.axisBottom(x).tickValues(xTickVals).tickSize(-h).tickFormat(''));

  const cg = g.append('g').attr('clip-path','url(#clip3)');

  cg.selectAll('.dot').data(data).enter().append('circle')
    .attr('cx',d=>{ try{return x(d.quantity);}catch{return -99;}})
    .attr('cy',d=>{ try{return y(d.revenue);}catch{return -99;}})
    .attr('r',d=>r(d.unitPrice))
    .attr('fill',d=>cColor(d.country))
    .attr('opacity',d=>S.country && d.country!==S.country ? .08 : .65)
    .attr('stroke',d=>S.country && d.country===S.country ? 'rgba(255,255,255,.5)' : 'transparent')
    .attr('stroke-width',1)
    .style('cursor','pointer')
    .on('mousemove',(e,d)=>{ mvTT(e); showTT(e,
      d.description.length>26 ? d.description.slice(0,26)+'…' : d.description,
      [['Revenue',fGBP(d.revenue)],['Quantity',d3.format(',')(d.quantity)],
       ['Avg Unit Price','£'+d.unitPrice.toFixed(2)],['Country',d.country]]); })
    .on('mouseleave',hideTT)
    .on('click',(e,d)=>{ S.country = S.country===d.country ? null : d.country; updateAll(); });

  const fmtY = v => v>=1e6 ? '£'+d3.format('.1f')(v/1e6)+'M' : v>=1e3 ? '£'+d3.format('.0f')(v/1e3)+'k' : '£'+v;
  const fmtX = v => v>=1e6 ? d3.format('.0f')(v/1e6)+'M'     : v>=1e3 ? d3.format('.0f')(v/1e3)+'k'     : ''+v;

  g.append('g').attr('class','axis').attr('transform',`translate(0,${h})`)
    .call(d3.axisBottom(x).tickValues(xTickVals).tickFormat(fmtX));
  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y).tickValues(yTickVals).tickFormat(fmtY));

  g.append('text').attr('x',w/2).attr('y',h+38)
    .attr('text-anchor','middle').attr('font-family','DM Mono')
    .attr('font-size',10).attr('fill','var(--muted)').text('Quantity (log scale)');
  g.append('text').attr('transform','rotate(-90)').attr('x',-h/2).attr('y',-62)
    .attr('text-anchor','middle').attr('font-family','DM Mono')
    .attr('font-size',10).attr('fill','var(--muted)').text('Revenue £ (log scale)');

  // Legend
  const leg = document.getElementById('leg3');
  leg.innerHTML = '';
  [...top_seven
  , 'Other'].forEach(c => {
    const item = document.createElement('div');
    item.className = 'leg-item';
    if (S.country && S.country !== c) item.style.opacity = '.35';
    item.innerHTML = `<span class="leg-dot" style="background:${colors(c)}"></span>${c}`;
    item.onclick = () => { S.country = S.country===c ? null : c; updateAll(); };
    leg.appendChild(item);
  });
}

//Updating all the views
function updateAll(redrawV1=true) {
  if (redrawV1) drawV1();
  drawV2();
  drawV3();
}

function resetAll() {
  S.brush=null; S.country=null;
  updateAll();
}

async function init() {
  D = await loadData();
  updateAll();
}

window.addEventListener('load', init);
window.addEventListener('resize', ()=>updateAll());