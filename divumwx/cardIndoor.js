// ===================== cardIndoor.js =====================
// Indoor temperature / humidity card: the outdoor temperature card's layout
// (thermometer + readouts), fed with indoor sensor values. Click opens the
// Indoors chart in the modal.

(function(){
  var LOOP_JSON_URL    = './jsondata/loop.json';
  var ARCHIVE_JSON_URL = './jsondata/archive.json';
  var POLL_MS = 30 * 1000;

  function getTrend(current, past){
    var diff = parseFloat(current) - parseFloat(past);
    if (diff >= 0.6) return 1;
    if (diff <= -0.6) return -1;
    return 0;
  }

  // ---- Media mode (2 or 1 dashboard columns) ----

  function currentColumnCount(){
    var grid = document.querySelector('.wrapper');
    if (!grid) return null;
    var cols = window.getComputedStyle(grid).getPropertyValue('grid-template-columns');
    if (!cols) return null;
    var tracks = cols.trim().split(/\s+/).filter(Boolean);
    return tracks.length || null;
  }
  function isMediaMode(){
    var n = currentColumnCount();
    return n !== null && n <= 2;
  }

  var currentUnits = loadStoredUnits();
  function loadStoredUnits(){
    try {
      var key = localStorage.getItem('dashboardUnitSystem') || 'uk';
      if (typeof SYSTEMS !== 'undefined' && SYSTEMS[key]) return SYSTEMS[key];
    } catch (e) {}
    return { temp: 'C', wind: 'mph', rain: 'mm' };
  }
  window.addEventListener('unitsystemchange', function(e){
    if (e.detail && e.detail.config) {
      currentUnits = e.detail.config;
      if (lastData) render(lastData);
    }
  });
  window.addEventListener('resize', function(){
    if (lastData) render(lastData);
  });

  window.addEventListener('i18nready', function(){
    if (lastData) render(lastData);
  });

  var mount = document.getElementById('indoorCard');
  if (!mount || !window.d3) return;
  mount.innerHTML = '';
  mount.style.position = 'relative';
  mount.style.display = 'flex';
  mount.style.flexDirection = 'column';

  mount.style.borderBottom = '0';

  var overlayTextColor = 'var(--bs-body-color)';

  var titleBar = document.createElement('div');
  titleBar.style.position = 'absolute';
  titleBar.style.top = '-20px';
  titleBar.style.left = '0';
  titleBar.style.right = '0';
  titleBar.style.height = '20px';
  titleBar.style.boxSizing = 'border-box';
  titleBar.style.display = 'flex';
  titleBar.style.alignItems = 'center';
  titleBar.style.justifyContent = 'space-between';
  titleBar.style.gap = '8px';
  titleBar.style.padding = '0 14px';
  titleBar.style.fontSize = '9px';
  titleBar.style.color = overlayTextColor;
  titleBar.style.background = 'transparent';

  var titleLabel = document.createElement('span');
  titleLabel.textContent = DivumWXI18N.t('Indoors');
  titleLabel.style.fontWeight = '600';
  titleLabel.style.whiteSpace = 'nowrap';
  titleLabel.style.overflow = 'hidden';
  titleLabel.style.textOverflow = 'ellipsis';

  var statusWrap = document.createElement('span');
  statusWrap.style.display = 'flex';
  statusWrap.style.alignItems = 'center';
  statusWrap.style.gap = '4px';
  statusWrap.style.flexShrink = '0';
  statusWrap.style.opacity = '0.85';

  var statusDot = document.createElement('span');
  statusDot.style.width = '6px';
  statusDot.style.height = '6px';
  statusDot.style.borderRadius = '50%';
  statusDot.style.background = '#999';
  statusDot.style.flexShrink = '0';

  var statusTime = document.createElement('span');

  statusWrap.appendChild(statusDot);
  statusWrap.appendChild(statusTime);
  titleBar.appendChild(titleLabel);
  titleBar.appendChild(statusWrap);
  mount.appendChild(titleBar);

  function stationTimeParts(date){
    var parts = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: StationTime.getTZ(), hourCycle: 'h23',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).forEach(function(p){ parts[p.type] = p.value; });
    return parts;
  }
  function setStatus(ok){
    statusDot.style.background = ok ? '#2ecc71' : '#e74c3c';
    var p = stationTimeParts(new Date());
    statusTime.textContent = p.hour + ':' + p.minute + ':' + p.second;
  }

  // ---- 60:40 content split (left: thermometer gauge, right: readouts) ----
  var contentWrap = document.createElement('div');
  contentWrap.style.height = '262.5px';
  contentWrap.style.width = '100%';
  contentWrap.style.boxSizing = 'border-box';
  contentWrap.style.overflow = 'hidden';
  contentWrap.style.display = 'flex';
  contentWrap.style.alignItems = 'stretch';
  mount.appendChild(contentWrap);

  var divider = document.createElement('div');
  divider.style.position = 'absolute';
  divider.style.left = '60%';
  divider.style.top = '6px';
  divider.style.bottom = '6px';
  divider.style.width = '1px';
  divider.style.background = 'var(--bs-border-color)';
  divider.style.pointerEvents = 'none';
  mount.appendChild(divider);

  var leftPane = document.createElement('div');
  leftPane.style.flex = '0 0 60%';
  leftPane.style.width = '60%';
  leftPane.style.height = '262.5px';
  leftPane.style.boxSizing = 'border-box';
  leftPane.style.overflow = 'hidden';
  leftPane.style.display = 'flex';
  leftPane.style.alignItems = 'center';
  leftPane.style.justifyContent = 'center';
  contentWrap.appendChild(leftPane);

  var rightPane = document.createElement('div');
  rightPane.style.flex = '0 0 40%';
  rightPane.style.width = '40%';
  rightPane.style.height = '262.5px';
  rightPane.style.boxSizing = 'border-box';
  rightPane.style.display = 'flex';
  rightPane.style.flexDirection = 'column';
  rightPane.style.justifyContent = 'center';
  rightPane.style.padding = '0 10px 0 14px';
  contentWrap.appendChild(rightPane);

  function addChipRow(){
    var row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.justifyContent = 'center';
    row.style.height = '32px';
    row.style.boxSizing = 'border-box';
    row.style.overflow = 'hidden';
    row.style.borderBottom = '1px solid var(--bs-border-color)';

    var labelEl = document.createElement('span');
    labelEl.style.fontSize = '10.5px';
    labelEl.style.lineHeight = '1';
    labelEl.style.fontVariantCaps = 'small-caps';
    labelEl.style.letterSpacing = '.06em';
    labelEl.style.color = 'var(--bs-body-color)';
    labelEl.style.opacity = '0.85';
    labelEl.style.whiteSpace = 'nowrap';
    labelEl.style.overflow = 'hidden';
    labelEl.style.textOverflow = 'ellipsis';
    row.appendChild(labelEl);

    var valueRow = document.createElement('span');
    valueRow.style.display = 'flex';
    valueRow.style.alignItems = 'baseline';
    valueRow.style.gap = '4px';
    row.appendChild(valueRow);

    var valueEl = document.createElement('span');
    valueEl.style.fontSize = '14.25px';
    valueEl.style.lineHeight = '1.2';
    valueEl.style.color = 'var(--bw-accent)';
    valueEl.style.whiteSpace = 'nowrap'; valueEl.style.overflow = 'hidden'; valueEl.style.textOverflow = 'ellipsis'; valueEl.style.minWidth = '0'; valueEl.style.flex = '1 1 auto';
    valueEl.style.fontFamily = '"IBM Plex Mono", ui-monospace, monospace';
    valueRow.appendChild(valueEl);

    var trendEl = document.createElement('span');
    trendEl.style.fontSize = '10px';
    valueRow.appendChild(trendEl);

    rightPane.appendChild(row);
    return { row: row, label: labelEl, value: valueEl, trend: trendEl };
  }

  var readoutRows = [];
  for (var ri = 0; ri < 9; ri++) readoutRows.push(addChipRow());
  readoutRows[readoutRows.length - 1].row.style.borderBottom = 'none';

  var cardLink = document.createElement('a');
  cardLink.className = 'card-whole-link';
  cardLink.href = 'charts-d3.html?type=indoor&embed=1';
  cardLink.setAttribute('data-modal', 'Indoors');
  DivumWXI18N.applyAttr(cardLink, 'data-title', 'Indoor Chart & Records');
  cardLink.setAttribute('data-type', 'iframe');
  cardLink.setAttribute('data-modal-width', '1400px');
  cardLink.setAttribute('data-modal-height', '700px');
  cardLink.setAttribute('data-url', 'charts-d3.html?type=indoor&embed=1');
  cardLink.style.position = 'absolute';
  cardLink.style.top = '-20px';
  cardLink.style.left = '0';
  cardLink.style.right = '0';
  cardLink.style.bottom = '0';
  cardLink.style.display = 'block';
  mount.appendChild(cardLink);

  function render(v){

    var height = 175;
    var bulbRadius = 25.5, tubeWidth = 16.5, tubeBorderWidth = 1,
        innerBulbColor = 'rgb(230, 200, 200)', tubeBorderColor = '#999999';
    var bottomY = height - 5, bulb_cy = bottomY - bulbRadius, bulb_cx = 45, top_cy = 5 + tubeWidth / 2;

    var mountSel = d3.select(leftPane);
    var svg = mountSel.select('svg');
    if (svg.empty()){
      svg = mountSel.append('svg').attr('viewBox', '-42 0 175 175').attr('width', '100%').attr('height', '100%');
    }
    svg.selectAll('*').remove();

    var unitsTemp = currentUnits.temp;
    function tc(c){ return unitsTemp === 'F' ? (c * 9 / 5 + 32) : c; }
    function td(d){ return unitsTemp === 'F' ? (d * 9 / 5) : d; }

    var currentTemp   = tc(v.currentTemp);
    var globalMaxTemp = tc(v.globalMaxTemp);
    var globalMinTemp = tc(v.globalMinTemp);
    var inTemp        = tc(v.inTemp);
    var appTemp       = tc(v.appTemp);
    var heatIndex      = tc(v.heatIndex);
    var avgToday        = tc(v.avgToday);
    var dewpoint         = tc(v.dewpoint);
    var windChill        = tc(v.windChill);
    var trend_outTemp   = td(v.trend_outTemp);

    titleLabel.textContent = DivumWXI18N.t('Indoors') + ' (\u00B0' + unitsTemp + ')';

    var defs = svg.append('defs');
    var bulbGradient = defs.append('radialGradient')
      .attr('id', 'bulbGradient').attr('cx', '50%').attr('cy', '50%').attr('r', '50%')
      .attr('fx', '50%').attr('fy', '50%');
    bulbGradient.append('stop').attr('offset', '0%').style('stop-color', innerBulbColor);
    bulbGradient.append('stop').attr('offset', '90%').style('stop-color', v.tempColor);

    var outlineHeight = bulb_cy - bulbRadius / 2 - 6.75;
    svg.append('rect')
      .attr('rx', 7.5).attr('x', 37.5).attr('y', 7)
      .attr('width', tubeWidth + 1 - tubeBorderWidth - 1.5).attr('height', outlineHeight)
      .style('stroke', tubeBorderColor).style('stroke-width', '0.75px').attr('fill', 'none');

    var step = (unitsTemp === 'F') ? 8 : 5;
    var domain = [ step * Math.floor(globalMinTemp / step), step * Math.ceil(globalMaxTemp / step) ];
    if (globalMinTemp - domain[0] < 0.66 * step) domain[0] -= step;
    if (domain[1] - globalMaxTemp < 0.66 * step) domain[1] += step;

    var yScale = d3.scaleLinear().domain(domain).range([bulb_cy - bulbRadius / 2 - 8.5, top_cy + 5]);
    var tubeFill_bottom = bulb_cy, tubeFill_top = yScale(currentTemp);

    svg.append('rect').attr('class', 'mx')
      .attr('x', 45 - (tubeWidth - tubeBorderWidth) / 2)
      .attr('y', yScale(currentTemp))
      .attr('width', tubeWidth - tubeBorderWidth)
      .attr('height', tubeFill_bottom - tubeFill_top)
      .attr('fill', v.tempColor);

    svg.append('circle').attr('class', 'bulb')
      .attr('cx', bulb_cx).attr('cy', bulb_cy).attr('r', bulbRadius - 6)
      .style('fill', 'url(#bulbGradient)').style('stroke-width', '2px');

    var tickValues = d3.range((domain[1] - domain[0]) / step + 1).map(function(n){ return domain[0] + n * step; });
    var axis = d3.axisLeft(yScale).tickValues(tickValues).tickSize(7).tickPadding(5);
    var tAxis = svg.append('g').attr('class', 'y-axis')
      .attr('transform', 'translate(' + (45 - tubeWidth / 2 - 5) + ', 0)').call(axis);

    tAxis.selectAll('.tick text').style('fill', 'var(--bs-body-color)').style('font-family', 'inherit').style('font-size', '8px');
    tAxis.select('path').style('stroke', 'none').style('fill', 'none');
    tAxis.selectAll('.tick line').style('stroke', tubeBorderColor).style('stroke-linecap', 'round').style('stroke-width', '2px');

    svg.append('text').attr('class', 'temperature-label').attr('id', 'tempText')
      .attr('x', 45).attr('y', bulb_cy + 5.5).style('text-anchor', 'middle').style('font-family', 'inherit')
      .style('font-weight', '600').style('font-size', '16px').style('fill', 'black')
      .text(currentTemp.toFixed(1));

    svg.append('text').attr('class', 'min-temp-label')
      .attr('x', 45 + tubeWidth / 2 + 13).attr('y', yScale(globalMinTemp) + 8.5)
      .attr('text-anchor', 'middle').style('font-family', 'inherit').style('fill', 'var(--bs-body-color)').style('font-size', '8px')
      .text(DivumWXI18N.t('Min'));
    svg.append('text').attr('class', 'max-temp-label')
      .attr('x', 45 + tubeWidth / 2 + 13).attr('y', yScale(globalMaxTemp) - 3)
      .attr('text-anchor', 'middle').style('font-family', 'inherit').style('fill', 'var(--bs-body-color)').style('font-size', '8px')
      .text(DivumWXI18N.t('Max'));

    svg.append('line').attr('class', 'min-temp-line')
      .attr('x1', 45 - tubeWidth / 2 + 20).attr('x2', 45 + tubeWidth / 2 + 22)
      .attr('y1', yScale(globalMinTemp)).attr('y2', yScale(globalMinTemp))
      .attr('stroke', tubeBorderColor).style('stroke-linecap', 'round').attr('stroke-width', 1.0);
    svg.append('line').attr('class', 'max-temp-line')
      .attr('x1', 45 - tubeWidth / 2 + 20).attr('x2', 45 + tubeWidth / 2 + 22)
      .attr('y1', yScale(globalMaxTemp)).attr('y2', yScale(globalMaxTemp))
      .attr('stroke', tubeBorderColor).style('stroke-linecap', 'round').attr('stroke-width', 1.0);

    // ---- Right pane: label/value/trend rows ----

    var mediaMode = isMediaMode();

    var weatherData = [
      { id: 'maxMin',      label: DivumWXI18N.t('Max | Min'),   value: globalMaxTemp.toFixed(1) + '\u00B0' + unitsTemp + ' | ' + globalMinTemp.toFixed(1) + '\u00B0' + unitsTemp, color: 'transparent', trend: 0 },
      { id: 'trend',       label: DivumWXI18N.t('Trend'),       value: trend_outTemp.toFixed(1) + '\u00B0' + unitsTemp, color: v.tempColor, trend: trend_outTemp },
      { id: 'apparent',    label: DivumWXI18N.t('Apparent'),    value: appTemp.toFixed(1) + '\u00B0' + unitsTemp, color: v.colorAppTemp, trend: getTrend(v.appTemp, v.appTemp_3hours) },
      { id: 'humidity',    label: DivumWXI18N.t('Humidity'),    value: v.humidity.toFixed(0) + '%', color: v.colorHumidityOut, trend: v.trend_outHumidity },
      { id: 'heatIndex',   label: DivumWXI18N.t('Heat Index'),  value: heatIndex.toFixed(1) + '\u00B0' + unitsTemp, color: v.colorHeatindex, trend: getTrend(v.heatIndex, v.heatIndex_3hours) },
      { id: 'avgToday',    label: DivumWXI18N.t('Avg Today'),   value: avgToday.toFixed(1) + '\u00B0' + unitsTemp, color: v.colorOutTempDayAvg, trend: getTrend(v.avgToday, v.avgToday_3hours) },
      { id: 'dewpoint',    label: DivumWXI18N.t('Dewpoint'),    value: dewpoint.toFixed(1) + '\u00B0' + unitsTemp, color: v.colorDewpoint, trend: v.trend_dewpoint },
      { id: 'avg3h',       label: DivumWXI18N.t('Avg Last 3h'), value: v.avg3h.toFixed(1) + '\u00B0' + unitsTemp, color: v.colorOutTempDayAvg, trend: 0 }
    ];
    if (mediaMode) {
      weatherData = weatherData.filter(function(d){ return d.id !== 'indoorTemp'; });
    }

    var rowHeight = 262.5 / weatherData.length;
    for (var ri2 = 0; ri2 < readoutRows.length; ri2++){
      var visible = ri2 < weatherData.length;
      var isLastVisible = ri2 === weatherData.length - 1;
      readoutRows[ri2].row.style.display = visible ? 'flex' : 'none';
      readoutRows[ri2].row.style.height = rowHeight + 'px';
      readoutRows[ri2].row.style.borderBottom = isLastVisible ? 'none' : '1px solid var(--bs-border-color)';
    }

    for (var wi = 0; wi < weatherData.length; wi++){
      var d = weatherData[wi], ref = readoutRows[wi];
      ref.label.textContent = d.label;
      ref.value.textContent = d.value;
      if (wi === 0) {
        ref.trend.textContent = '';
      } else {
        ref.trend.style.color = d.color;
        ref.trend.textContent = parseFloat(d.trend) > 0 ? '\u279A' : (parseFloat(d.trend) < 0 ? '\u2798' : '\u2799');
      }
    }
  }

  // Indoor dew point (Magnus), apparent temperature (no wind) and heat index.
  function indoorDew(t, rh){
    if (t === null || rh === null || rh <= 0) return 0;
    var a = 17.62, b = 243.12;
    var g = Math.log(rh / 100) + (a * t) / (b + t);
    return (b * g) / (a - g);
  }
  function indoorApparent(t, rh){
    if (t === null || rh === null) return 0;
    var e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
    return t + 0.33 * e - 4;
  }
  function indoorHeat(t, rh){
    if (t === null || rh === null) return 0;
    var tf = t * 9 / 5 + 32;
    if (tf <= 80) return t;
    var hi = -42.379 + 2.04901523 * tf + 10.14333127 * rh - 0.22475541 * tf * rh
           - 0.00683783 * tf * tf - 0.05481717 * rh * rh + 0.00122874 * tf * tf * rh
           + 0.00085282 * tf * rh * rh - 0.00000199 * tf * tf * rh * rh;
    return (hi - 32) * 5 / 9;
  }

  var lastData = null;
  function refresh(){
    Promise.allSettled([
      fetch(LOOP_JSON_URL + ((LOOP_JSON_URL).indexOf('?')>-1?'&':'?') + '_=' + Date.now(), {cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }),
      fetch(ARCHIVE_JSON_URL + ((ARCHIVE_JSON_URL).indexOf('?')>-1?'&':'?') + '_=' + Date.now(), {cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    ]).then(function(results){
      var loopResult = results[0], archResult = results[1];
      if(loopResult.status === 'rejected') console.warn('cardIndoor: loop.json fetch failed —', loopResult.reason.message);
      if(archResult.status === 'rejected') console.warn('cardIndoor: archive.json fetch failed —', archResult.reason.message);

      var loop = loopResult.status === 'fulfilled' ? loopResult.value : {};
      var arch = archResult.status === 'fulfilled' ? archResult.value : {};
      var o = loop.observations || {};
      var t = arch.temp || {}, dw = arch.dew || {}, h = arch.humid || {};
      function num(x, fallback){ return (typeof x === 'number' && !isNaN(x)) ? x : (fallback || 0); }

      var indoorNow = num(o.inTemp, num(t.indoor_current, null));
      var indoorRH = num(o.inHumidity, num(parseFloat(h.indoors_current), null));
      var indoorAvg3h = num(parseFloat(t.indoor_avg_3h), null);
      var indoorAvg3hRH = num(parseFloat(t.indoor_humid_avg_3h), null);
      var indoorApp = indoorApparent(indoorNow, indoorRH);
      var indoorApp3h = indoorApparent(indoorAvg3h, indoorAvg3hRH);
      var indoorHI = num(parseFloat(t.indoor_feels_like_c), null);
      if (indoorHI === null) indoorHI = indoorHeat(indoorNow, indoorRH);
      var indoorHI3h = indoorHeat(indoorAvg3h, indoorAvg3hRH);

      lastData = {
        globalMaxTemp: num(parseFloat(t.indoor_day_max), indoorNow),
        globalMinTemp: num(parseFloat(t.indoor_day_min), indoorNow),
        currentTemp:   num(indoorNow, 0),
        inTemp:        num(indoorNow, 0),
        colorInTemp:        o.inTempColor       || 'var(--bw-accent)',
        tempColor:          o.inTempColor       || 'var(--bw-accent)',
        colorAppTemp:       o.inTempColor || 'var(--bw-accent)',
        colorHumidityOut:   'var(--bs-body-color)',
        colorHeatindex:     o.inTempColor || 'var(--bw-accent)',
        colorOutTempDayAvg: 'var(--bs-body-color)',
        colorDewpoint:      o.inTempColor || 'var(--bw-accent)',
        colorWindchill:     o.windChillColor    || 'var(--bw-accent)',
        trend_inTemp:      num(t.indoor_trend, 0),
        trend_outTemp:     num(t.indoor_trend, 0),
        trend_dewpoint:    0,
        trend_outHumidity: 0,
        humidity:          num(indoorRH, 0),
        appTemp:           num(indoorApp, 0),
        appTemp_3hours:    num(indoorApp3h, 0),
        heatIndex:         num(indoorHI, 0),
        heatIndex_3hours:  num(indoorHI3h, 0),
        avgToday:          num(parseFloat(t.indoor_day_avg), 0),
        avgToday_3hours:   num(indoorAvg3h, 0),
        avg3h:             num(indoorAvg3h, 0),
        dewpoint:          num(indoorDew(indoorNow, indoorRH), 0),
        windChill:         0,
        windChill_3hours:  0
      };
      render(lastData);
      setStatus(loopResult.status === 'fulfilled' && archResult.status === 'fulfilled');
    }).catch(function(e){
      console.warn('cardIndoor: refresh failed —', e.message);
      setStatus(false);
    });
  }
  refresh();
  setInterval(refresh, POLL_MS);
})();
