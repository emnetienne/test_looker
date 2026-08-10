/**
 * Looker Custom Visualization — Treemap "Répartition des impressions"
 * -------------------------------------------------------------------
 * - Taille du carré  = 1re mesure (ex: % d'impressions)
 * - Couleur du carré = la même mesure (petite valeur = clair, grande valeur = foncé)
 * - Libellé          = 1re dimension (nom de la sous-catégorie) affiché DANS le carré
 *
 * Attends : 1 dimension (sous-catégorie) + 1 mesure (impressions).
 * D3 v7 est chargé automatiquement si absent.
 */
looker.plugins.visualizations.add({
  id: "impressions_treemap",
  label: "Treemap (valeur = couleur)",

  options: {
    color_min: {
      type: "string", display: "color", label: "Couleur (petites valeurs)",
      default: "#DBE4FF", section: "Style", order: 1
    },
    color_max: {
      type: "string", display: "color", label: "Couleur (grandes valeurs)",
      default: "#1F3D99", section: "Style", order: 2
    },
    show_value: {
      type: "boolean", label: "Afficher la valeur",
      default: true, section: "Style", order: 3
    },
    label_size: {
      type: "number", label: "Taille du texte (px)",
      default: 14, section: "Style", order: 4
    },
    border_width: {
      type: "number", label: "Épaisseur des bordures (px)",
      default: 2, section: "Style", order: 5
    },
    border_color: {
      type: "string", display: "color", label: "Couleur des bordures",
      default: "#FFFFFF", section: "Style", order: 6
    }
  },

  // Charge D3 une seule fois
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
      ".tm-wrap{position:relative;width:100%;height:100%;overflow:hidden;" +
      "font-family:'Google Sans',Roboto,Arial,Helvetica,sans-serif;}" +
      ".tm-cell{position:absolute;box-sizing:border-box;overflow:hidden;}" +
      ".tm-label{padding:6px 8px;line-height:1.15;}" +
      ".tm-name{display:block;font-weight:600;word-break:break-word;}" +
      ".tm-val{display:block;font-weight:700;opacity:.92;margin-top:2px;}";
    element.appendChild(style);

    this._wrap = document.createElement("div");
    this._wrap.className = "tm-wrap";
    element.appendChild(this._wrap);
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
      return lum > 0.6 ? "#1A1A1A" : "#FFFFFF";
    }

    function render(d3, nodes) {
      var w = element.clientWidth || self._wrap.clientWidth || 600;
      var h = element.clientHeight || self._wrap.clientHeight || 400;

      var borderW = config.border_width == null ? 2 : Number(config.border_width);
      var borderC = config.border_color || "#FFFFFF";
      var cMin = config.color_min || "#DBE4FF";
      var cMax = config.color_max || "#1F3D99";
      var fontSize = config.label_size == null ? 14 : Number(config.label_size);
      var showVal = config.show_value !== false;

      var vals = nodes.map(function (n) { return n.value; });
      var minV = Math.min.apply(null, vals);
      var maxV = Math.max.apply(null, vals);
      var t = d3.scaleLinear()
        .domain(minV === maxV ? [0, maxV || 1] : [minV, maxV])
        .range([0, 1]).clamp(true);
      var interp = d3.interpolateRgb(cMin, cMax);

      var root = d3.hierarchy({ children: nodes })
        .sum(function (d) { return d.value; })
        .sort(function (a, b) { return b.value - a.value; });

      d3.treemap()
        .size([w, h])
        .paddingInner(borderW)
        .paddingOuter(borderW)
        .round(true)
        .tile(d3.treemapSquarify.ratio(1))(root);

      self._wrap.style.background = borderC;

      var html = "";
      root.leaves().forEach(function (leaf) {
        var d = leaf.data;
        var bg = interp(t(d.value));
        var fg = textColor(d3, bg);
        var cw = leaf.x1 - leaf.x0;
        var ch = leaf.y1 - leaf.y0;
        var showText = cw > 36 && ch > 22;

        html += '<div class="tm-cell" style="' +
          "left:" + leaf.x0 + "px;top:" + leaf.y0 + "px;" +
          "width:" + cw + "px;height:" + ch + "px;" +
          "background:" + bg + ";color:" + fg + ';">';

        if (showText) {
          html += '<div class="tm-label" style="font-size:' + fontSize + 'px;">';
          html += '<span class="tm-name">' + escapeHtml(d.name) + "</span>";
          if (showVal) {
            html += '<span class="tm-val" style="font-size:' +
              Math.max(10, fontSize - 1) + 'px;">' + escapeHtml(d.rendered) + "</span>";
          }
          html += "</div>";
        }
        html += "</div>";
      });

      self._wrap.innerHTML = html;
    }
  }
});
