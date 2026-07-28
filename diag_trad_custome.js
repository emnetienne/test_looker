/**
 * ============================================================================
 *  Barres (design "Paniers moyens") — Visualisation custom Looker
 * ----------------------------------------------------------------------------
 *  Barres plates, valeurs colorées au-dessus, axe en €, légende en bas,
 *  et DERNIÈRE barre détachée du groupe (espace + séparateur pointillé foncé).
 *
 *  Entrée : plusieurs mesures (1 ligne) OU 1 dimension + 1 mesure.
 * ============================================================================
 */

looker.plugins.visualizations.add({
  id: "cylinder_bars",
  label: "Barres trad",

  options: {
    title_text: {
      section: "Style", type: "string", label: "Titre", default: "", order: 1
    },
    bar_colors: {
      section: "Style", type: "string", label: "Couleurs (JSON array)", display: "text",
      default: '["#3D50B5","#EC6A4E","#7DB249","#F5CE5E"]', order: 2
    },
    value_color_mode: {
      section: "Style", type: "string", label: "Couleur des valeurs", display: "select",
      values: [{ "Couleur de la barre": "bar" }, { "Foncé": "dark" }],
      default: "bar", order: 3
    },
    bar_radius: {
      section: "Style", type: "number", label: "Arrondi des barres (px)", default: 0, order: 4
    },
    show_legend: {
      section: "Style", type: "boolean", label: "Afficher la légende", default: true, order: 5
    },

    separate_last: {
      section: "Données", type: "boolean", label: "Détacher la dernière barre", default: true, order: 1
    },
    currency_symbol: {
      section: "Données", type: "string", label: "Symbole (vide = aucun)", default: "€", order: 2
    },
    decimals: {
      section: "Données", type: "number", label: "Décimales des valeurs", default: 0, order: 3
    }
  },

  create: function (element, config) {
    element.innerHTML = "";
    var style = document.createElement("style");
    style.textContent = `
      .cb-root { width:100%; height:100%; display:flex; flex-direction:column;
        box-sizing:border-box; padding:10px 12px; background:transparent;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; }
      .cb-root * { box-sizing:border-box; }
      .cb-title { flex:0 0 auto; text-align:center; font-weight:600; color:#1F2D4D;
        font-size:20px; padding-bottom:8px; }
      .cb-chart { flex:1 1 auto; min-height:0; width:100%; }
      .cb-legend { flex:0 0 auto; display:flex; flex-wrap:wrap; gap:6px 22px;
        padding:10px 4px 2px; }
      .cb-leg-item { display:flex; align-items:flex-start; gap:8px; font-size:14px;
        color:#3a4245; max-width:24%; min-width:150px; }
      .cb-dot { flex:0 0 auto; width:13px; height:13px; border-radius:50%; margin-top:2px; }
      .cb-empty { flex:1 1 auto; display:flex; align-items:center; justify-content:center;
        color:#93A0B8; font-size:14px; }
    `;
    element.appendChild(style);

    this._root = document.createElement("div");
    this._root.className = "cb-root";
    this._root.innerHTML =
      '<div class="cb-title" style="display:none"></div>' +
      '<div class="cb-chart"></div>' +
      '<div class="cb-legend"></div>';
    element.appendChild(this._root);

    this._element = element;
    this._titleEl = this._root.querySelector(".cb-title");
    this._chart   = this._root.querySelector(".cb-chart");
    this._legend  = this._root.querySelector(".cb-legend");

    var self = this;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () {
        if (self._raf) cancelAnimationFrame(self._raf);
        self._raf = requestAnimationFrame(function () { self._render(); });
      });
      this._ro.observe(this._chart);
    }
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    var bars = [];
    if (!data || !data.length) { this._bars = []; this._render(); done(); return; }

    if (data.length === 1 && (queryResponse.fields.measure_like || []).length > 1) {
      var row = data[0];
      queryResponse.fields.measure_like.forEach(function (f) {
        var cell = row[f.name];
        bars.push({
          label: f.label_short || f.label || f.name,
          value: cell ? Number(cell.value) || 0 : 0,
          rendered: cell ? cell.rendered : null
        });
      });
    } else {
      var dim = (queryResponse.fields.dimension_like || [])[0];
      var mea = (queryResponse.fields.measure_like || [])[0];
      if (!mea) {
        this.addError({ title: "Mesure requise", message: "Ajoutez au moins une mesure." });
        done(); return;
      }
      bars = data.map(function (r) {
        var mc = r[mea.name], dc = dim ? r[dim.name] : null;
        return {
          label: dc ? (dc.value != null ? String(dc.value) : dc.rendered) : (mea.label_short || mea.label),
          value: mc ? Number(mc.value) || 0 : 0,
          rendered: mc ? mc.rendered : null
        };
      });
    }

    this._bars = bars;
    this._config = config;
    this._render();
    done();
  },

  _render: function () {
    var config = this._config || {};
    var bars = this._bars || [];

    var title = (config.title_text || "").trim();
    this._titleEl.style.display = title ? "" : "none";
    this._titleEl.textContent = title;

    if (!bars.length) {
      this._chart.innerHTML = '<div class="cb-empty">Aucune donnée</div>';
      this._legend.innerHTML = "";
      return;
    }

    var colors;
    try { colors = JSON.parse(config.bar_colors || "[]"); } catch (e) { colors = []; }
    if (!colors.length) colors = ["#3D50B5", "#EC6A4E", "#7DB249", "#F5CE5E"];
    var sym = config.currency_symbol != null ? config.currency_symbol : "€";
    var dec = (config.decimals != null) ? Number(config.decimals) : 0;
    var sepLast = config.separate_last !== false && bars.length >= 2;
    var valDark = config.value_color_mode === "dark";
    var radius = Math.max(0, Number(config.bar_radius) || 0);

    function fmt(v, decimals) {
      var s = new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals
      }).format(v);
      return sym ? s + sym : s;
    }
    function niceNum(range, round) {
      var exp = Math.floor(Math.log10(range || 1));
      var f = (range || 1) / Math.pow(10, exp), nf;
      if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
      else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
      return nf * Math.pow(10, exp);
    }

    var W = this._chart.clientWidth || 700;
    var H = this._chart.clientHeight || 360;
    if (W < 40 || H < 40) return;

    var maxVal = Math.max.apply(null, bars.map(function (b) { return b.value; }));
    if (!isFinite(maxVal) || maxVal <= 0) maxVal = 1;

    var axisFont = Math.max(10, Math.min(15, H * 0.035));
    var valueFont = Math.max(13, Math.min(24, H * 0.06));

    var mTop = valueFont + 12;
    var mBottom = 18;
    var mLeft = Math.max(40, axisFont * 3.4);
    var mRight = 14;
    var plotTop = mTop, plotBottom = H - mBottom;
    var plotH = Math.max(10, plotBottom - plotTop);
    var plotLeft = mLeft, plotRight = W - mRight;
    var plotW = Math.max(10, plotRight - plotLeft);

    var top = maxVal * 1.15;
    var step = niceNum(top / 4, true);
    var niceMax = Math.ceil(top / step) * step;
    function yScale(v) { return plotBottom - (v / niceMax) * plotH; }

    var n = bars.length;
    var sepExtra = sepLast ? 0.7 : 0;
    var unit = plotW / (n + sepExtra);
    var barW = Math.min(unit * 0.5, 0.16 * W);

    var centers = [];
    var x = plotLeft + unit * 0.5;
    for (var i = 0; i < n; i++) {
      if (sepLast && i === n - 1) x += sepExtra * unit;
      centers.push(x);
      x += unit;
    }

    var INK = "#1F2D4D";
    var baseline = yScale(0);
    var svg = '<svg width="100%" height="100%" viewBox="0 0 ' + W + ' ' + H +
      '" preserveAspectRatio="xMidYMid meet">';

    // Grille + libellés d'axe
    for (var t = 0; t <= niceMax + 1e-9; t += step) {
      var gy = yScale(t);
      svg += '<line x1="' + plotLeft + '" y1="' + gy + '" x2="' + plotRight + '" y2="' + gy +
        '" stroke="#E7E4DD" stroke-width="1"/>';
      svg += '<text x="' + (plotLeft - 8) + '" y="' + (gy + axisFont * 0.35) +
        '" text-anchor="end" font-size="' + axisFont + '" fill="#7A8699">' +
        fmt(t, 0) + '</text>';
    }

    // Séparateur pointillé foncé avant la dernière barre
    if (sepLast) {
      var sepX = (centers[n - 2] + barW / 2 + centers[n - 1] - barW / 2) / 2;
      svg += '<line x1="' + sepX + '" y1="' + (plotTop - 6) + '" x2="' + sepX + '" y2="' + (baseline + 6) +
        '" stroke="#33415C" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0.5 8"/>';
    }

    // Barres plates
    for (var b = 0; b < n; b++) {
      var bar = bars[b];
      var color = colors[b % colors.length];
      var cx = centers[b];
      var yTop = yScale(bar.value);
      var bodyH = Math.max(1, baseline - yTop);

      svg += '<rect x="' + (cx - barW / 2) + '" y="' + yTop + '" width="' + barW +
        '" height="' + bodyH + '" rx="' + radius + '" fill="' + color + '"/>';

      var valTxt = (bar.rendered != null && bar.rendered !== "") ? bar.rendered : fmt(bar.value, dec);
      svg += '<text x="' + cx + '" y="' + (yTop - 10) + '" text-anchor="middle" font-weight="700" ' +
        'font-size="' + valueFont + '" fill="' + (valDark ? INK : color) + '">' +
        escapeHtml(valTxt) + '</text>';
    }

    // Axe 0
    svg += '<line x1="' + plotLeft + '" y1="' + baseline + '" x2="' + plotRight + '" y2="' + baseline +
      '" stroke="#C7C2B8" stroke-width="1.2"/>';
    svg += "</svg>";
    this._chart.innerHTML = svg;

    // Légende
    if (config.show_legend !== false) {
      this._legend.style.display = "";
      var html = "";
      for (var l = 0; l < n; l++) {
        html += '<div class="cb-leg-item">' +
          '<span class="cb-dot" style="background:' + (colors[l % colors.length]) + '"></span>' +
          '<span>' + escapeHtml(bars[l].label) + '</span></div>';
      }
      this._legend.innerHTML = html;
    } else {
      this._legend.style.display = "none";
      this._legend.innerHTML = "";
    }
  }
});

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
