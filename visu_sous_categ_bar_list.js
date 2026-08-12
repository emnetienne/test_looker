/**
 * Looker Custom Visualization — Classement moderne "bar list"
 * -----------------------------------------------------------
 * Chaque ligne : rang · nom de sous-catégorie · barre proportionnelle · valeur · %
 * - Longueur de barre = valeur / valeur max
 * - Couleur de barre  = dégradé par rang (contraste max) — ou pow / linéaire
 * - %                 = part de la ligne sur le total
 *
 * Rendu statique (pas de survol, pensé pour un screenshot) mais 100% responsive :
 * les lignes remplissent la hauteur et les tailles de texte s'adaptent (ResizeObserver).
 * Attends : 1 dimension (sous-catégorie) + 1 mesure. D3 v7 chargé si absent.
 */
looker.plugins.visualizations.add({
  id: "impressions_barlist",
  label: "Classement (bar list moderne)",

  options: {
    color_min:        { type: "string", display: "color", label: "Couleur (petites valeurs)", default: "#DCE6FF", section: "Style", order: 1 },
    color_max:        { type: "string", display: "color", label: "Couleur (grandes valeurs)", default: "#12259E", section: "Style", order: 2 },
    color_scale:      { type: "string", display: "select", label: "Répartition des couleurs",
                        values: [{ "Par rang (contraste max)": "rank" }, { "Racine (accentue les écarts)": "pow" }, { "Linéaire": "linear" }],
                        default: "rank", section: "Style", order: 3 },
    track_color:      { type: "string", display: "color", label: "Couleur de la piste", default: "#EEF1F6", section: "Style", order: 4 },
    bg_color:         { type: "string", display: "color", label: "Fond", default: "#FFFFFF", section: "Style", order: 5 },
    row_divider:      { type: "boolean", label: "Séparateurs de lignes", default: false, section: "Style", order: 6 },
    name_size:        { type: "number", label: "Taille du texte (px, max)", default: 14, section: "Texte", order: 1 },
    show_rank:        { type: "boolean", label: "Afficher le rang", default: true, section: "Texte", order: 2 },
    show_value:       { type: "boolean", label: "Afficher la valeur", default: true, section: "Texte", order: 3 },
    show_percent:     { type: "boolean", label: "Afficher le %", default: true, section: "Texte", order: 4 },
    percent_decimals: { type: "number", label: "Décimales du %", default: 0, section: "Texte", order: 5 }
  },

  _ensureD3: function () {
    return new Promise(function (resolve) {
      if (window.d3 && window.d3.interpolateRgb) return resolve(window.d3);
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
      ".bl-wrap{position:relative;width:100%;height:100%;overflow:hidden;box-sizing:border-box;padding:8px 12px;" +
      "font-family:'Google Sans','Inter',Roboto,-apple-system,Segoe UI,Arial,sans-serif;color:#0F172A;}" +
      ".bl-row{display:flex;align-items:center;box-sizing:border-box;}" +
      ".bl-rank{flex:0 0 auto;text-align:right;color:#94A3B8;font-weight:600;font-variant-numeric:tabular-nums;}" +
      ".bl-name{flex:0 0 auto;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:600;padding:0 12px 0 8px;}" +
      ".bl-bar{flex:1 1 auto;position:relative;min-width:36px;}" +
      ".bl-track{position:absolute;left:0;top:50%;transform:translateY(-50%);width:100%;border-radius:999px;}" +
      ".bl-fill{position:absolute;left:0;top:50%;transform:translateY(-50%);border-radius:999px;min-width:3px;}" +
      ".bl-val{flex:0 0 auto;text-align:right;color:#334155;font-variant-numeric:tabular-nums;padding-left:14px;}" +
      ".bl-pct{flex:0 0 auto;text-align:right;font-weight:800;font-variant-numeric:tabular-nums;padding-left:12px;}";
    element.appendChild(style);

    this._wrap = document.createElement("div");
    this._wrap.className = "bl-wrap";
    element.appendChild(this._wrap);

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
      if (self.addError) self.addError({ title: "Champs requis", message: "Ajoute 1 dimension (sous-catégorie) et 1 mesure." });
      done();
      return;
    }
    var dimName = dims[0].name, measName = meas[0].name;

    var nodes = data.map(function (row) {
      var cell = row[measName] || {}, dcell = row[dimName] || {};
      var v = cell.value == null ? null : Number(cell.value);
      return {
        name: dcell.rendered != null ? dcell.rendered : dcell.value,
        value: v == null ? 0 : v,
        rendered: cell.rendered != null ? cell.rendered : (v == null ? "" : String(v))
      };
    }).filter(function (n) { return n.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });

    if (!nodes.length) { self._wrap.innerHTML = ""; done(); return; }

    self._ensureD3().then(function (d3) {
      self._redraw = function () { render(d3, nodes); };
      render(d3, nodes);
      done();
    });

    function esc(s) {
      s = (s == null ? "" : String(s));
      return s.replace(/[&<>"']/g, function (m) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
      });
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function fmtPct(p, dec) { var s = p.toFixed(dec); if (dec > 0) s = s.replace(".", ","); return s + "%"; }

    function render(d3, nodes) {
      var W = element.clientWidth || self._wrap.clientWidth || 700;
      var H = element.clientHeight || self._wrap.clientHeight || 400;
      var n = nodes.length;

      var cMin = config.color_min || "#DCE6FF";
      var cMax = config.color_max || "#12259E";
      var mode = config.color_scale || "rank";
      var trackC = config.track_color || "#EEF1F6";
      var bgC = config.bg_color || "#FFFFFF";
      var divider = config.row_divider === true;
      var baseFont = config.name_size == null ? 14 : Number(config.name_size);
      var showRank = config.show_rank !== false;
      var showVal = config.show_value !== false;
      var showPct = config.show_percent !== false;
      var pctDec = config.percent_decimals == null ? 0 : Math.max(0, Number(config.percent_decimals));

      var total = nodes.reduce(function (a, x) { return a + x.value; }, 0) || 1;
      var maxV = nodes[0].value || 1;
      var minV = nodes[n - 1].value;

      // échelle de couleur
      var dom = minV === maxV ? [0, maxV || 1] : [minV, maxV];
      var lin = d3.scaleLinear().domain(dom).range([0, 1]).clamp(true);
      var pw = d3.scalePow().exponent(0.4).domain(dom).range([0, 1]).clamp(true);
      var interp = d3.interpolateRgb(cMin, cMax);
      function colorOf(v, i) {
        var t = mode === "rank" ? (n <= 1 ? 1 : (n - 1 - i) / (n - 1))
              : mode === "pow" ? pw(v) : lin(v);
        return interp(t);
      }

      // dimensions responsives
      var availH = H - 16;
      var rowH = availH / n;
      var nameFont = Math.round(clamp(rowH * 0.4, 9, baseFont));
      var valFont = nameFont;
      var pctFont = Math.round(nameFont * 1.08);
      var rankFont = Math.round(nameFont * 0.9);
      var barH = clamp(Math.round(rowH * 0.46), 5, 20);

      // largeurs de colonnes
      var rankW = showRank ? Math.round(rankFont * 2.2) : 0;
      var nameW = Math.max(110, Math.round(W * 0.24));
      var maxChars = 0;
      nodes.forEach(function (x) { if (x.rendered.length > maxChars) maxChars = x.rendered.length; });
      var valW = showVal ? Math.round(maxChars * valFont * 0.6 + 14) : 0;
      var pctW = showPct ? Math.round(pctFont * 3.4) : 0;

      self._wrap.style.background = bgC;

      var html = "";
      nodes.forEach(function (x, i) {
        var pct = x.value / total * 100;
        var fillW = Math.max(0, x.value / maxV * 100);
        var fill = colorOf(x.value, i);
        var rowStyle = "height:" + rowH + "px;" + (divider && i < n - 1 ? "border-bottom:1px solid #F0F2F5;" : "");

        html += '<div class="bl-row" style="' + rowStyle + '">';
        if (showRank) html += '<div class="bl-rank" style="flex:0 0 ' + rankW + 'px;font-size:' + rankFont + 'px;">' + (i + 1) + '</div>';
        html += '<div class="bl-name" style="flex:0 0 ' + nameW + 'px;font-size:' + nameFont + 'px;">' + esc(x.name) + '</div>';
        html += '<div class="bl-bar">' +
                  '<div class="bl-track" style="height:' + barH + 'px;background:' + trackC + ';"></div>' +
                  '<div class="bl-fill" style="height:' + barH + 'px;width:' + fillW + '%;background:' + fill + ';"></div>' +
                '</div>';
        if (showVal) html += '<div class="bl-val" style="flex:0 0 ' + valW + 'px;font-size:' + valFont + 'px;">' + esc(x.rendered) + '</div>';
        if (showPct) html += '<div class="bl-pct" style="flex:0 0 ' + pctW + 'px;font-size:' + pctFont + 'px;">' + fmtPct(pct, pctDec) + '</div>';
        html += '</div>';
      });

      self._wrap.innerHTML = html;
    }
  }
});
