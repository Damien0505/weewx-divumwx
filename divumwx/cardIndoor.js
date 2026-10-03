// ===================== cardIndoor.js =====================
// Indoor temperature / humidity card. Mirrors the readouts of cardTemperature
// (current, trend, max/min, averages, apparent, heat index, dew point) for an
// indoor sensor. Clicking the card opens the Indoors chart in the modal.
(function(){
  var ARCHIVE_JSON_URL = './jsondata/archive.json';
  var POLL_MS = 30 * 1000;
  var CHART_URL = 'charts-d3.html?type=indoor&embed=1';

  var mount = document.querySelector('[data-card-id="cardIndoor"]');
  if (!mount) return;
  mount.innerHTML = '';
  mount.style.position = 'relative';
  mount.style.display = 'flex';
  mount.style.flexDirection = 'column';

  var link = document.createElement('a');
  link.className = 'card-whole-link';
  link.href = CHART_URL;
  link.setAttribute('data-modal', 'Indoors');
  link.setAttribute('data-title', 'Indoor Chart & Records');
  link.setAttribute('data-type', 'iframe');
  link.setAttribute('data-modal-width', '1400px');
  link.setAttribute('data-modal-height', '700px');
  link.setAttribute('data-url', CHART_URL);
  link.style.cssText = 'position:absolute;top:-20px;left:0;right:0;bottom:0;display:block;';
  mount.appendChild(link);

  var title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = 'Indoors';
  title.style.cssText = 'padding:0 0 4px;font-weight:600;';
  mount.appendChild(title);

  var list = document.createElement('div');
  list.style.cssText = 'flex:1;display:flex;flex-direction:column;justify-content:space-around;';
  mount.appendChild(list);

  function num(x){ return (typeof x === 'number' && !isNaN(x)) ? x : null; }
  function fmt(x, unit, dp){ return x === null ? '—' : x.toFixed(dp === undefined ? 1 : dp) + unit; }
  function arrow(t){ return t > 0 ? '➚' : (t < 0 ? '➘' : '➙'); }

  // Dew point from temperature (°C) and relative humidity (%), Magnus form.
  function dewPoint(t, rh){
    if (t === null || rh === null || rh <= 0) return null;
    var a = 17.62, b = 243.12;
    var g = Math.log(rh / 100) + (a * t) / (b + t);
    return (b * g) / (a - g);
  }

  // Apparent temperature with no wind (indoors): T + 0.33e - 4, e in hPa.
  function apparent(t, rh){
    if (t === null || rh === null) return null;
    var e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
    return t + 0.33 * e - 4;
  }

  // Heat index, same NWS formula the server uses (below 27 °C it is the air temperature).
  function heatIndex(t, rh){
    if (t === null || rh === null) return null;
    var tf = t * 9 / 5 + 32;
    if (tf <= 80) return t;
    var hi = -42.379 + 2.04901523 * tf + 10.14333127 * rh - 0.22475541 * tf * rh
           - 0.00683783 * tf * tf - 0.05481717 * rh * rh + 0.00122874 * tf * tf * rh
           + 0.00085282 * tf * rh * rh - 0.00000199 * tf * tf * rh * rh;
    return (hi - 32) * 5 / 9;
  }

  function row(label){
    var r = document.createElement('div');
    r.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--bs-border-color);padding:0;font-size:0.9em;line-height:1.35;';
    var l = document.createElement('span');
    l.textContent = label;
    var v = document.createElement('span');
    v.style.cssText = 'font-family:monospace;';
    r.appendChild(l);
    r.appendChild(v);
    list.appendChild(r);
    return v;
  }

  var rows = {
    temp:       row('Indoor Temp'),
    maxmin:     row('Max / Min Today'),
    avgToday:   row('Avg Today'),
    avg3h:      row('Avg Last 3h'),
    humid:      row('Humidity'),
    humidMaxMin:row('Humidity Max / Min'),
    humidAvg3h: row('Humidity Avg 3h'),
    dew:        row('Dew Point'),
    apparent:   row('Apparent'),
    heat:       row('Heat Index'),
    heatAvg3h:  row('Heat Index Avg 3h')
  };

  function render(d){
    rows.temp.innerHTML = '';
    var tv = document.createElement('span');
    tv.textContent = fmt(d.temp, '°C') + ' ' + arrow(d.trend);
    rows.temp.appendChild(tv);

    rows.maxmin.textContent   = fmt(d.max, '°C') + ' / ' + fmt(d.min, '°C');
    rows.avgToday.textContent = fmt(d.avgToday, '°C');
    rows.avg3h.textContent    = fmt(d.avg3h, '°C');
    rows.humid.textContent    = fmt(d.humid, '%', 0);
    rows.humidMaxMin.textContent = fmt(d.humidMax, '%', 0) + ' / ' + fmt(d.humidMin, '%', 0);
    rows.humidAvg3h.textContent  = fmt(d.humidAvg3h, '%', 0);
    rows.dew.textContent      = fmt(dewPoint(d.temp, d.humid), '°C');
    rows.apparent.textContent = fmt(apparent(d.temp, d.humid), '°C');
    rows.heat.textContent     = fmt(heatIndex(d.temp, d.humid), '°C');
    rows.heatAvg3h.textContent= fmt(heatIndex(d.avg3h, d.humidAvg3h), '°C');
  }

  function refresh(){
    fetch(ARCHIVE_JSON_URL + '?_=' + Date.now(), {cache: 'no-store'})
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(arch){
        var t = arch.temp || {}, h = arch.humid || {};
        render({
          temp:      num(t.indoor_current),
          trend:     num(t.indoor_trend) || 0,
          max:       num(parseFloat(t.indoor_day_max)),
          min:       num(parseFloat(t.indoor_day_min)),
          avgToday:  num(parseFloat(t.indoor_day_avg)),
          avg3h:     num(parseFloat(t.indoor_avg_3h)),
          humid:     num(parseFloat(h.indoors_current)),
          humidMax:  num(parseFloat(h.indoors_day_max)),
          humidMin:  num(parseFloat(h.indoors_day_min)),
          humidAvg3h: num(parseFloat(t.indoor_humid_avg_3h))
        });
      })
      .catch(function(e){ console.warn('cardIndoor: refresh failed —', e.message); });
  }

  refresh();
  setInterval(refresh, POLL_MS);
})();
