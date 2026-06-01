looker.plugins.visualizations.add({
  id: "funnel_custom",
  label: "Funnel Custom",
  options: {
    label_color_overrides: {
      type: "string",
      label: "Label colors (JSON)",
      display: "text",
      default: '{}',
      section: "Style",
      order: 1,
      placeholder: '{"Clients éligibles": "#e63946"}'
    },
    show_percentages: {
      type: "boolean",
      label: "Afficher les pourcentages",
      default: true,
      section: "Style",
      order: 2
    },
    show_dropoff: {
      type: "boolean",
      label: "Afficher le taux de chute",
      default: true,
      section: "Style",
      order: 3
    },
    funnel_colors: {
      type: "string",
      label: "Couleurs (JSON array)",
      display: "text",
      default: '["#2563eb","#f97316","#22c55e","#a855f7","#ec4899"]',
      section: "Style",
      order: 4
    },
    neck_ratio: {
      type: "number",
      label: "Ratio col / haut (0.1 - 0.9)",
      display: "range",
      min: 0.1,
      max: 0.9,
      step: 0.05,
      default: 0.35,
      section: "Style",
      order: 5
    }
  },

  create: function(element, config) {
    element.innerHTML = '';
    var container = document.createElement('div');
    container.id = 'funnel_root';
    container.style.cssText = [
      'width:100%',
      'height:100%',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'background:#fff',
      'box-sizing:border-box',
      'padding:16px 8px'
    ].join(';');
    element.appendChild(container);

    var style = document.createElement('style');
    style.textContent = [
      '@keyframes fadeInDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes growWidth{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0% 0 0)}}',
      '.fcs-row{opacity:0;animation:fadeInDown .4s ease forwards}',
      '.fcs-bar-fill{animation:growWidth .6s cubic-bezier(.4,0,.2,1) forwards}',
      '.fcs-row:hover .fcs-bar-fill{filter:brightness(1.08)}',
      '.fcs-row:hover .fcs-value{font-weight:700}'
    ].join('');
    element.appendChild(style);
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    var root = element.querySelector('#funnel_root');
    if (!root) { done(); return; }
    root.innerHTML = '';

    if (!data || data.length === 0) {
      root.innerHTML = '<p style="color:#999;font-size:13px">Aucune donnée</p>';
      done(); return;
    }

    var dimField   = queryResponse.fields.dimension_like[0];
    var measField  = queryResponse.fields.measure_like[0];
    if (!dimField || !measField) { done(); return; }

    var rows = data.map(function(row) {
      return {
        label: row[dimField.name].value,
        value: row[measField.name].value
      };
    });

    var maxVal = rows[0].value;
    var neckRatio = config.neck_ratio || 0.35;
    var showPct   = config.show_percentages !== false;
    var showDrop  = config.show_dropoff !== false;

    var colors;
    try { colors = JSON.parse(config.funnel_colors || '[]'); } catch(e) { colors = []; }
    if (!colors.length) colors = ['#2563eb','#f97316','#22c55e','#a855f7','#ec4899'];

    var labelColors;
    try { labelColors = JSON.parse(config.label_color_overrides || '{}'); } catch(e) { labelColors = {}; }

    var containerW = root.offsetWidth || 600;
    var rowH = Math.max(44, Math.min(72, Math.floor((root.offsetHeight - 32) / rows.length) - 12));

    rows.forEach(function(row, i) {
      var pct   = maxVal > 0 ? row.value / maxVal : 0;
      var dropPct = (i > 0 && rows[i-1].value > 0)
        ? Math.round((1 - row.value / rows[i-1].value) * 100)
        : null;

      var widthPct   = neckRatio + (1 - neckRatio) * (1 - i / Math.max(rows.length - 1, 1));
      var barWidthPct = widthPct * pct * 100;

      var color   = colors[i % colors.length];
      var bgColor = hexToRgba(color, 0.08);
      var labelC  = labelColors[row.label] || '#1a1a2e';

      var rowEl = document.createElement('div');
      rowEl.className = 'fcs-row';
      rowEl.style.cssText = [
        'width:' + Math.round(widthPct * 100) + '%',
        'margin:0 auto 8px',
        'position:relative',
        'cursor:default',
        'animation-delay:' + (i * 80) + 'ms'
      ].join(';');

      var label = document.createElement('div');
      label.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'margin-bottom:4px',
        'padding:0 2px'
      ].join(';');

      var labelText = document.createElement('span');
      labelText.style.cssText = [
        'font-size:13px',
        'font-weight:500',
        'color:' + labelC,
        'letter-spacing:-.01em'
      ].join(';');
      labelText.textContent = row.label;

      var metaBox = document.createElement('span');
      metaBox.style.cssText = 'display:flex;align-items:center;gap:8px';

      var valSpan = document.createElement('span');
      valSpan.className = 'fcs-value';
      valSpan.style.cssText = [
        'font-size:13px',
        'font-weight:600',
        'color:#1a1a2e',
        'font-variant-numeric:tabular-nums',
        'transition:font-weight .15s'
      ].join(';');
      valSpan.textContent = formatNum(row.value);
      metaBox.appendChild(valSpan);

      if (showPct) {
        var pctSpan = document.createElement('span');
        pctSpan.style.cssText = [
          'font-size:11px',
          'color:#fff',
          'background:' + color,
          'border-radius:99px',
          'padding:2px 7px',
          'font-weight:600',
          'letter-spacing:-.01em'
        ].join(';');
        pctSpan.textContent = Math.round(pct * 100) + '%';
        metaBox.appendChild(pctSpan);
      }

      label.appendChild(labelText);
      label.appendChild(metaBox);
      rowEl.appendChild(label);

      var track = document.createElement('div');
      track.style.cssText = [
        'width:100%',
        'height:' + rowH + 'px',
        'background:' + bgColor,
        'border-radius:6px',
        'overflow:hidden',
        'position:relative'
      ].join(';');

      var fill = document.createElement('div');
      fill.className = 'fcs-bar-fill';
      fill.style.cssText = [
        'height:100%',
        'width:' + barWidthPct + '%',
        'background:' + color,
        'border-radius:6px',
        'animation-delay:' + (i * 80 + 200) + 'ms',
        'clip-path:inset(0 100% 0 0)'
      ].join(';');
      track.appendChild(fill);

      rowEl.appendChild(track);

      if (showDrop && dropPct !== null && i > 0) {
        var dropEl = document.createElement('div');
        dropEl.style.cssText = [
          'text-align:right',
          'font-size:11px',
          'color:#e63946',
          'margin-top:3px',
          'padding-right:2px',
          'font-weight:500'
        ].join(';');
        dropEl.textContent = '▼ ' + dropPct + '% de chute';
        rowEl.appendChild(dropEl);
      }

      root.appendChild(rowEl);
    });

    done();
  }
});

function formatNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('fr-FR');
}

function hexToRgba(hex, alpha) {
  var r = parseInt(hex.slice(1,3),16);
  var g = parseInt(hex.slice(3,5),16);
  var b = parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}
