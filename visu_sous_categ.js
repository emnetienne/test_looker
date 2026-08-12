/**
 * Looker Custom Visualization — Treemap "Répartition des impressions" (v2, moderne)
 * ---------------------------------------------------------------------------------
 * - Taille de la brique  = 1re mesure (ex: impressions)
 * - Couleur de la brique = la même mesure (petite valeur = clair, grande = foncé)
 * - Libellé              = 1re dimension (nom de la sous-catégorie)
 * - % affiché            = part de la brique sur le total
 *
 * Pensée pour un rendu statique (screenshot) : pas de survol, mais 100% responsive
 * (ResizeObserver). D3 v7 est chargé automatiquement si absent.
 */
looker.plugins.visualizations.add({
  id: "impressions_treemap",
  label: "Treemap (valeur = couleur)",

  options: {
    color_min:       { type: "string", display: "color", label: "Couleur (petites valeurs)", default: "#C7D6FF", section: "Style", order: 1 },
    color_max:       { type: "string", display: "color", label: "Couleur (grandes valeurs)", default: "#1B3AA6", section: "Style", order: 2 },
    bg_color:        { type: "string", display: "color", label: "Fond (entre les briques)", default: "#FFFFFF", section: "Style", order: 3 },
    gap:             { type: "number", label: "Espacement entre briques (px)", default: 6, section: "Style", order: 4 },
    corner_radius:   { type: "number", label: "Arrondi des coins (px)", default: 12, section: "Style", order: 5 },
    label_size:      { type: "number", label: "Taille du nom (px)", default: 14, section: "Texte", order: 1 },
    show_percent:    { type: "boolean", label: "Afficher le %", default: true, section: "Texte", order: 2 },
    percent_decimals:{ type: "number", label: "Décimales du %", default: 0, section: "Texte", order: 3 },
    show_value:      { type: "boolean", label: "Afficher la valeur brute", default: true, section: "Texte", order: 4 }
  },

  _ensureD3: function () {
    return new Promise(function (resolve) {
      if (window.d3 && window.d3.treemap) return resolve(window.d3);
      var s = document.createElement("script");
      s.src = "https://d3js.org/d3.v7.min.js";
      s.onload = function () { resolve(window.d3); };
      document.head.appendChild(s);
    });
  },

  create: function (element, config) {
    element.innerHTML = "";
    var style = document.createElement("style");
    style.innerHTML =
      ".tm-wrap{position:relative;width:100%;height:100%;overflow:hidden;box-sizing:border-box;" +
      "font-family:'Google Sans','Inter',Roboto,-apple-system,Segoe UI,Arial,sans-serif;}" +
      ".tm-cell{position:absolute;box-sizing:border-box;overflow:hidden;display:flex;" +
      "box-shadow:0 1px 3px rgba(16,24,40,.12);}" +
      ".tm-inner{padding:10px 12px;display:flex;flex-direction:column;justify-content:flex-start;" +
      "width:100%;height:100%;box-sizing:border-box;}" +
      ".tm-name{font-weight:600;opacity:.92;letter-spacing:.2px;line-height:1.15;word-break:break-word;}" +
      ".tm-pct{font-weight:800;line-height:1;margin-top:auto;letter-spacing:-.5px;}" +
      ".tm-val{font-weight:500;opacity:.78;margin-top:4px;line-height:1.1;}";
    element.appendChild(style);

    this._wrap = document.createElement("div");
    this._wrap.className = "tm-wrap";
    element.appendChild(this._wrap);

    // Responsive : redessine au redimensionnement de la tuile
    var self = this;
    this._redraw = null;
    if (window.ResizeObserver && !this._ro) {
      this._ro = new ResizeObserver(function () {
        if (self._raf) cancelAnimationFrame(self._raf);
        self._raf = requestAnimationFrame(function () { if (self._redraw) self._redraw(); });
      });
      this._ro.observe(element);
    }
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    var self = this;
    if (self.clearErrors) self.clearErrors();

    var dims = queryResponse.fields.dimension_like;
    var meas = queryResponse.fields.measure_like;
    if (!dims || !dims.length || !meas || !meas.length) {
      if (self.addError) self.addError({
        title: "Champs requis",
        message: "Ajoute 1 dimension (sous-catégorie) et 1 mesure (impressions)."
      });
      done();
      return;
    }

    var dimName = dims[0].name;
    var measName = meas[0].name;

    var nodes = data.map(function (row) {
      var cell = row[measName] || {};
      var dcell = row[dimName] || {};
      var v = cell.value == null ? null : Number(cell.value);
      return {
        name: dcell.rendered != null ? dcell.rendered : dcell.value,
        value: v == null ? 0 : v,
        rendered: cell.rendered != null ? cell.rendered : (v == null ? "" : String(v))
      };
    }).filter(function (n) { return n.value > 0; });

    if (!nodes.length) { self._wrap.innerHTML = ""; done(); return; }

    self._ensureD3().then(function (d3) {
      self._redraw = function () { render(d3, nodes); };
      render(d3, nodes);
      done();
    });

    function escapeHtml(s) {
      s = (s == null ? "" : String(s));
      return s.replace(/[&<>"']/g, function (m) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
      });
    }
    function textColor(d3, bg) {
      var c = d3.rgb(bg);
      var lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
      return lum > 0.6 ? "#0F172A" : "#FFFFFF";
    }
    function fmtPct(p, dec) {
      var s = p.toFixed(dec);
      if (dec > 0) s = s.replace(".", ",");
      return s + "%";
    }

    function render(d3, nodes) {
      var w = element.clientWidth || self._wrap.clientWidth || 600;
      var h = element.clientHeight || self._wrap.clientHeight || 400;

      var gap = config.gap == null ? 6 : Number(config.gap);
      var radius = config.corner_radius == null ? 12 : Number(config.corner_radius);
      var bgC = config.bg_color || "#FFFFFF";
      var cMin = config.color_min || "#C7D6FF";
      var cMax = config.color_max || "#1B3AA6";
      var nameFont = config.label_size == null ? 14 : Number(config.label_size);
      var showPct = config.show_percent !== false;
      var pctDec = config.percent_decimals == null ? 0 : Math.max(0, Number(config.percent_decimals));
      var showVal = config.show_value !== false;

      var total = nodes.reduce(function (a, n) { return a + n.value; }, 0) || 1;
      var vals = nodes.map(function (n) { return n.value; });
      var minV = Math.min.apply(null, vals);
      var maxV = Math.max.apply(null, vals);
      var t = d3.scaleLinear().domain(minV === maxV ? [0, maxV || 1] : [minV, maxV]).range([0, 1]).clamp(true);
      var interp = d3.interpolateRgb(cMin, cMax);

      var root = d3.hierarchy({ children: nodes })
        .sum(function (d) { return d.value; })
        .sort(function (a, b) { return b.value - a.value; });

      d3.treemap()
        .size([w, h])
        .paddingInner(gap)
        .paddingOuter(gap)
        .round(true)
        .tile(d3.treemapSquarify.ratio(1))(root);

      self._wrap.style.background = bgC;

      var html = "";
      root.leaves().forEach(function (leaf) {
        var d = leaf.data;
        var bg = interp(t(d.value));
        var fg = textColor(d3, bg);
        var cw = leaf.x1 - leaf.x0;
        var ch = leaf.y1 - leaf.y0;
        var r = Math.max(0, Math.min(radius, cw / 2, ch / 2));

        // % de la brique sur le total
        var pct = d.value / total * 100;

        // Tailles de police adaptatives -> "moderne / dashboard"
        var pctFont = Math.round(Math.max(16, Math.min(cw * 0.26, ch * 0.42, 46)));
        var nameF = Math.round(Math.max(11, Math.min(nameFont, cw * 0.14, ch * 0.22)));

        // Affichage progressif selon la place dispo
        var full = cw > 78 && ch > 66;
        var pctOnly = !full && cw > 44 && ch > 30;

        html += '<div class="tm-cell" style="' +
          "left:" + leaf.x0 + "px;top:" + leaf.y0 + "px;" +
          "width:" + cw + "px;height:" + ch + "px;" +
          "background:" + bg + ";color:" + fg + ";border-radius:" + r + 'px;">';

        if (full) {
          html += '<div class="tm-inner">';
          html += '<span class="tm-name" style="font-size:' + nameF + 'px;">' + escapeHtml(d.name) + '</span>';
          if (showPct) html += '<span class="tm-pct" style="font-size:' + pctFont + 'px;">' + fmtPct(pct, pctDec) + '</span>';
          if (showVal) html += '<span class="tm-val" style="font-size:' + Math.max(10, nameF - 2) + 'px;">' + escapeHtml(d.rendered) + '</span>';
          html += '</div>';
        } else if (pctOnly) {
          html += '<div class="tm-inner" style="justify-content:center;align-items:flex-start;padding:6px 8px;">';
          if (showPct) html += '<span class="tm-pct" style="font-size:' + Math.round(pctFont * 0.8) + 'px;margin-top:0;">' + fmtPct(pct, pctDec) + '</span>';
          else html += '<span class="tm-name" style="font-size:' + nameF + 'px;">' + escapeHtml(d.name) + '</span>';
          html += '</div>';
        }
        html += '</div>';
      });

      self._wrap.innerHTML = html;
    }
  }
});
