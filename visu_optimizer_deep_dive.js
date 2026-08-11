/**
 * Looker Custom Visualization — Courbes cumulées + événements "changement de l'optimizer"
 * ---------------------------------------------------------------------------------------
 * Convention des champs (dans l'ordre) :
 *   - 1re DIMENSION  -> axe X (ex: Campaign Date)
 *   - 2e  DIMENSION  -> ÉVÉNEMENTS : un marqueur vertical est posé sur chaque date
 *                       où cette dimension a une valeur (ex: Date de changement de l'optimizer)
 *   - MESURES / table calcs -> courbes (1re = axe gauche, 2e = axe droit si double axe)
 *
 * Au survol : tooltip avec la date, la valeur de chaque courbe, et — si la date correspond
 * à un changement d'optimizer — la valeur de l'événement mise en avant.
 * D3 v7 est chargé automatiquement si absent.
 */
looker.plugins.visualizations.add({
  id: "line_optimizer_events",
  label: "Courbes + événements optimizer",

  options: {
    color_serie_1: { type: "string", display: "color", label: "Couleur série 1 (axe gauche)", default: "#E8703A", section: "Séries", order: 1 },
    color_serie_2: { type: "string", display: "color", label: "Couleur série 2 (axe droit)", default: "#1F4BB8", section: "Séries", order: 2 },
    dual_axis:     { type: "boolean", label: "Double axe Y (2e série à droite)", default: true, section: "Séries", order: 3 },
    curve:         { type: "string", display: "select", label: "Style de courbe", values: [{ "Linéaire": "linear" }, { "Lissée": "smooth" }], default: "linear", section: "Séries", order: 4 },
    show_points:   { type: "boolean", label: "Afficher les points", default: false, section: "Séries", order: 5 },

    marker_color:  { type: "string", display: "color", label: "Couleur des événements", default: "#111827", section: "Événements optimizer", order: 1 },
    marker_style:  { type: "string", display: "select", label: "Style du repère", values: [{ "Ligne verticale": "line" }, { "Ligne + point": "lineDot" }, { "Point seul": "dot" }], default: "lineDot", section: "Événements optimizer", order: 2 },
    marker_dash:   { type: "boolean", label: "Ligne en pointillés", default: true, section: "Événements optimizer", order: 3 },
    marker_labels: { type: "boolean", label: "Libellé au sommet du repère", default: false, section: "Événements optimizer", order: 4 },

    event_diff:          { type: "boolean", label: "Comparer à l'événement précédent", default: true, section: "Événements optimizer", order: 5 },
    event_show_previous: { type: "boolean", label: "Afficher la valeur précédente", default: true, section: "Événements optimizer", order: 6 },
    event_diff_color:    { type: "string", display: "color", label: "Couleur de la valeur modifiée", default: "#F97316", section: "Événements optimizer", order: 7 },
    event_separator:     { type: "string", label: "Séparateur des valeurs (vide = auto)", default: "", section: "Événements optimizer", order: 8 }
  },

  _ensureD3: function () {
    return new Promise(function (resolve) {
      if (window.d3 && window.d3.scaleTime) return resolve(window.d3);
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
      ".loe-wrap{position:relative;width:100%;height:100%;overflow:hidden;font-family:'Google Sans',Roboto,Arial,sans-serif;}" +
      ".loe-tip{position:absolute;pointer-events:none;background:#1f2430;color:#fff;padding:8px 10px;border-radius:8px;" +
      "font-size:12px;line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:0;transition:opacity .08s;z-index:5;max-width:280px;}" +
      ".loe-tip .loe-date{font-weight:700;margin-bottom:4px;}" +
      ".loe-tip .loe-row{display:flex;align-items:center;gap:6px;white-space:nowrap;}" +
      ".loe-tip .loe-dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:0 0 auto;}" +
      ".loe-tip .loe-evt{margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.2);font-weight:600;}" +
      ".loe-tip .loe-evt .loe-part{display:block;font-weight:400;margin-top:2px;}" +
      ".loe-tip .loe-old{color:#9aa3af;font-weight:400;}" +
      ".loe-tip .loe-same{color:#c4cad3;font-weight:400;}" +
      ".loe-axis text{font-size:11px;fill:#5b6472;}" +
      ".loe-axis path,.loe-axis line{stroke:#d7dbe0;}" +
      ".loe-grid line{stroke:#eceef1;}" +
      ".loe-legend{font-size:12px;fill:#3c4450;}";
    element.appendChild(style);

    this._wrap = document.createElement("div");
    this._wrap.className = "loe-wrap";
    element.appendChild(this._wrap);

    this._tip = document.createElement("div");
    this._tip.className = "loe-tip";
    this._wrap.appendChild(this._tip);

    // Redessine automatiquement quand la tuile est redimensionnée (responsive)
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

    var dims = queryResponse.fields.dimension_like || [];
    var series = queryResponse.fields.measure_like;
    if (!series || !series.length) {
      series = [].concat(queryResponse.fields.measures || [], queryResponse.fields.table_calculations || []);
    }

    if (!dims.length || !series.length) {
      if (self.addError) self.addError({
        title: "Champs requis",
        message: "Ajoute au moins : 1 dimension (axe X), idéalement une 2e dimension (événement optimizer), et 1+ mesure/table calc (courbes)."
      });
      done();
      return;
    }

    self._ensureD3().then(function (d3) {
      self._redraw = function () { render(d3); };
      render(d3);
      done();
    });

    function esc(s) {
      s = (s == null ? "" : String(s));
      return s.replace(/[&<>"']/g, function (m) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
      });
    }
    function hasVal(cell) {
      if (!cell) return false;
      var v = cell.value;
      return v != null && v !== "" && String(v).trim() !== "" && String(v) !== "∅";
    }

    function render(d3) {
      var wrap = self._wrap, tip = self._tip;
      var W = element.clientWidth || wrap.clientWidth || 800;
      var H = element.clientHeight || wrap.clientHeight || 400;

      var xDim = dims[0].name;
      var eventDim = dims.length > 1 ? dims[1].name : null;

      // --- Regroupe par date (dédoublonne les dates identiques) ---
      var _map = new Map();
      data.forEach(function (r) {
        var xc = r[xDim] || {};
        if (xc.value == null) return;
        var dt = new Date(xc.value);
        if (isNaN(dt.getTime())) return;
        var k = +dt;
        var slot = _map.get(k);
        if (!slot) {
          _map.set(k, {
            date: dt,
            xLabel: xc.rendered != null ? xc.rendered : xc.value,
            row: r,
            eventCell: eventDim ? (r[eventDim] || {}) : null
          });
        } else if (eventDim && hasVal(r[eventDim])) {
          slot.eventCell = r[eventDim];
        }
      });
      var rows = Array.from(_map.values()).sort(function (a, b) { return a.date - b.date; });

      if (!rows.length) { wrap.querySelectorAll("svg").forEach(function (n) { n.remove(); }); done(); return; }

      var c1 = config.color_serie_1 || "#E8703A";
      var c2 = config.color_serie_2 || "#1F4BB8";
      var palette = ["#7B61FF", "#2CA02C", "#D62728", "#17BECF", "#BCBD22"];

      var seriesDefs = series.map(function (f, i) {
        return {
          name: f.name,
          label: f.label_short || f.label || f.name,
          axis: (config.dual_axis && i === 1) ? "right" : "left",
          color: i === 0 ? c1 : (i === 1 ? c2 : palette[(i - 2) % palette.length]),
          values: rows.map(function (d) {
            var c = d.row[f.name] || {};
            var num = (c.value == null || c.value === "") ? null : Number(c.value);
            return { date: d.date, v: (num != null && !isNaN(num)) ? num : null, rendered: c.rendered != null ? c.rendered : (c.value == null ? "" : String(c.value)) };
          })
        };
      });

      var hasRight = config.dual_axis && seriesDefs.some(function (s) { return s.axis === "right"; });

      function maxOf(axis) {
        var m = 0;
        seriesDefs.filter(function (s) { return s.axis === axis; })
          .forEach(function (s) { s.values.forEach(function (p) { if (p.v != null && p.v > m) m = p.v; }); });
        return m || 1;
      }
      var leftMax = maxOf("left");
      var rightMax = hasRight ? maxOf("right") : 1;

      // --- Événements ---
      var events = rows.filter(function (d) { return hasVal(d.eventCell); }).map(function (d) {
        return { date: d.date, xLabel: d.xLabel, rendered: d.eventCell.rendered != null ? d.eventCell.rendered : String(d.eventCell.value) };
      });
      // valeur du changement précédent (pour comparaison)
      events.forEach(function (ev, i) { ev.prev = i > 0 ? events[i - 1].rendered : null; });
      var evByDate = {};
      events.forEach(function (ev) { evByDate[+ev.date] = ev; });

      // --- Comparaison "quelle valeur a changé" (tooltip) ---
      var diffColor = config.event_diff_color || "#F97316";
      var showPrev = config.event_show_previous !== false;
      var doDiff = config.event_diff !== false;

      function pickSep(a, b) {
        if (config.event_separator) return config.event_separator;
        var cands = [";", "|", "\n", ",", " / "];
        for (var i = 0; i < cands.length; i++) {
          var s = cands[i];
          if (a.indexOf(s) >= 0 && a.split(s).length > 1 && a.split(s).length === b.split(s).length) return s;
        }
        return null;
      }
      function isKV(t) { return /^[^=]+=.*/.test(t); }
      function diffParts(cur, prev, sep) {
        var ca = cur.split(sep).map(function (t) { return t.trim(); });
        var pa = prev.split(sep).map(function (t) { return t.trim(); });
        var kv = ca.every(isKV) && pa.every(isKV);
        var out = [];
        if (kv) {
          var pm = {};
          pa.forEach(function (t) { var i = t.indexOf("="); pm[t.slice(0, i).trim()] = t.slice(i + 1).trim(); });
          ca.forEach(function (t) {
            var i = t.indexOf("="), k = t.slice(0, i).trim(), v = t.slice(i + 1).trim();
            var ov = pm.hasOwnProperty(k) ? pm[k] : null;
            if (ov === null) {
              out.push('<span class="loe-part">' + esc(k) + ' = <b style="color:' + diffColor + '">' + esc(v) + '</b> <span class="loe-old">(nouveau)</span></span>');
            } else if (ov !== v) {
              out.push('<span class="loe-part">' + esc(k) + ' = <b style="color:' + diffColor + '">' + esc(v) + '</b>' + (showPrev ? ' <span class="loe-old">(avant : ' + esc(ov) + ')</span>' : '') + '</span>');
            } else {
              out.push('<span class="loe-part loe-same">' + esc(k) + ' = ' + esc(v) + '</span>');
            }
          });
        } else {
          ca.forEach(function (v, i) {
            var ov = i < pa.length ? pa[i] : null;
            if (ov !== null && ov === v) {
              out.push('<span class="loe-part loe-same">' + esc(v) + '</span>');
            } else {
              out.push('<span class="loe-part"><b style="color:' + diffColor + '">' + esc(v) + '</b>' + (showPrev && ov !== null ? ' <span class="loe-old">(avant : ' + esc(ov) + ')</span>' : '') + '</span>');
            }
          });
        }
        return out.join("");
      }
      function eventTipHtml(ev, topBorder) {
        var style = topBorder === false ? ' style="border-top:none;padding-top:0;margin-top:0;"' : '';
        var cur = ev.rendered == null ? "" : String(ev.rendered);
        var prev = ev.prev == null ? null : String(ev.prev);
        if (!doDiff || prev == null) {
          return '<div class="loe-evt"' + style + '>⚙ Changement d\'optimizer : <b>' + esc(cur) + '</b></div>';
        }
        var sep = pickSep(cur, prev), body;
        if (sep) {
          body = diffParts(cur, prev, sep);
        } else if (cur === prev) {
          body = '<span class="loe-part loe-same">' + esc(cur) + ' (inchangé)</span>';
        } else {
          body = '<span class="loe-part"><b style="color:' + diffColor + '">' + esc(cur) + '</b>' +
            (showPrev ? ' <span class="loe-old">(avant : ' + esc(prev) + ')</span>' : '') + '</span>';
        }
        return '<div class="loe-evt"' + style + '>⚙ Changement d\'optimizer' + body + '</div>';
      }

      // --- Marges & tailles ---
      var m = { top: 22, right: hasRight ? 66 : 20, bottom: 74, left: 66 };
      var iw = Math.max(10, W - m.left - m.right);
      var ih = Math.max(10, H - m.top - m.bottom);

      var xExtent = d3.extent(rows, function (d) { return d.date; });
      var xSpan = (xExtent[1] - xExtent[0]) || 864e5; // 1 jour par défaut si une seule date
      var xPad = xSpan * 0.04;                         // ~4% de marge de chaque côté
      var x = d3.scaleTime()
        .domain([new Date(+xExtent[0] - xPad), new Date(+xExtent[1] + xPad)])
        .range([0, iw]);
      var yL = d3.scaleLinear().domain([0, leftMax]).nice().range([ih, 0]);
      var yR = d3.scaleLinear().domain([0, rightMax]).nice().range([ih, 0]);

      var curveFn = config.curve === "smooth" ? d3.curveMonotoneX : d3.curveLinear;
      function lineGen(scale) {
        return d3.line().defined(function (p) { return p.v != null; })
          .x(function (p) { return x(p.date); }).y(function (p) { return scale(p.v); }).curve(curveFn);
      }

      // --- SVG ---
      wrap.querySelectorAll("svg").forEach(function (n) { n.remove(); });
      var svg = d3.select(wrap).append("svg").attr("width", W).attr("height", H);
      var g = svg.append("g").attr("transform", "translate(" + m.left + "," + m.top + ")");

      // grille horizontale (axe gauche)
      g.append("g").attr("class", "loe-grid")
        .call(d3.axisLeft(yL).ticks(5).tickSize(-iw).tickFormat(""))
        .select(".domain").remove();

      // axes
      var fmtNum = d3.format("~s");
      g.append("g").attr("class", "loe-axis")
        .call(d3.axisLeft(yL).ticks(5).tickFormat(function (d) { return fmtNum(d).replace("G", "Md"); }));
      if (hasRight) {
        g.append("g").attr("class", "loe-axis").attr("transform", "translate(" + iw + ",0)")
          .call(d3.axisRight(yR).ticks(5).tickFormat(function (d) { return fmtNum(d).replace("G", "Md"); }));
      }
      // graduations = dates réelles, sous-échantillonnées -> plus aucun doublon de libellé
      var maxTicks = Math.max(2, Math.floor(iw / 95));
      var stepT = Math.max(1, Math.ceil(rows.length / maxTicks));
      var tickVals = rows.filter(function (d, i) { return i % stepT === 0; }).map(function (d) { return d.date; });
      var lastDate = rows[rows.length - 1].date;
      if (tickVals[tickVals.length - 1] !== lastDate) tickVals.push(lastDate);
      g.append("g").attr("class", "loe-axis").attr("transform", "translate(0," + ih + ")")
        .call(d3.axisBottom(x).tickValues(tickVals).tickFormat(d3.timeFormat("%d/%m/%y")))
        .selectAll("text").attr("transform", "rotate(-40)").style("text-anchor", "end");

      // --- Événements (repères verticaux) ---
      var mStyle = config.marker_style || "lineDot";
      var mColor = config.marker_color || "#111827";
      var gEv = g.append("g");
      events.forEach(function (ev) {
        var px = x(ev.date);
        if (mStyle === "line" || mStyle === "lineDot") {
          gEv.append("line").attr("x1", px).attr("x2", px).attr("y1", 0).attr("y2", ih)
            .attr("stroke", mColor).attr("stroke-width", 1.5)
            .attr("stroke-dasharray", config.marker_dash ? "4 4" : null).attr("opacity", 0.8);
        }
        if (mStyle === "dot" || mStyle === "lineDot") {
          gEv.append("circle").attr("cx", px).attr("cy", 0).attr("r", 4.5)
            .attr("fill", mColor).attr("stroke", "#fff").attr("stroke-width", 1.5);
        }
        if (config.marker_labels) {
          gEv.append("text").attr("x", px).attr("y", -6).attr("text-anchor", "middle")
            .style("font-size", "10px").style("fill", mColor).style("font-weight", "600")
            .text(ev.rendered.length > 14 ? ev.rendered.slice(0, 13) + "…" : ev.rendered);
        }
      });

      // --- Courbes ---
      seriesDefs.forEach(function (s) {
        g.append("path").datum(s.values).attr("fill", "none").attr("stroke", s.color)
          .attr("stroke-width", 2.5).attr("d", lineGen(s.axis === "right" ? yR : yL));
        if (config.show_points) {
          g.selectAll(null).data(s.values.filter(function (p) { return p.v != null; })).enter()
            .append("circle").attr("cx", function (p) { return x(p.date); })
            .attr("cy", function (p) { return (s.axis === "right" ? yR : yL)(p.v); })
            .attr("r", 2.5).attr("fill", s.color);
        }
      });

      // --- Crosshair + tooltip séries ---
      var guide = g.append("line").attr("y1", 0).attr("y2", ih).attr("stroke", "#9aa3af")
        .attr("stroke-width", 1).attr("stroke-dasharray", "3 3").style("opacity", 0);
      var bisect = d3.bisector(function (d) { return d.date; }).left;

      function showTip(html, evt) {
        tip.innerHTML = html;
        tip.style.opacity = 1;
        var pt = d3.pointer(evt, wrap);
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var left = pt[0] + 14; if (left + tw > W) left = pt[0] - tw - 14;
        var top = pt[1] - th - 10; if (top < 0) top = pt[1] + 14;
        tip.style.left = left + "px";
        tip.style.top = top + "px";
      }
      function hideTip() { tip.style.opacity = 0; }

      var overlay = g.append("rect").attr("width", iw).attr("height", ih)
        .style("fill", "none").style("pointer-events", "all");

      overlay.on("mousemove", function (evt) {
        var mx = d3.pointer(evt, this)[0];
        var d0 = x.invert(mx);
        var i = bisect(rows, d0);
        var a = rows[i - 1], b = rows[i];
        var d = (!a) ? b : (!b) ? a : ((d0 - a.date) > (b.date - d0) ? b : a);
        if (!d) return;
        guide.attr("x1", x(d.date)).attr("x2", x(d.date)).style("opacity", 1);

        var html = '<div class="loe-date">' + esc(d.xLabel) + "</div>";
        seriesDefs.forEach(function (s) {
          var p = s.values.find(function (v) { return v.date.getTime() === d.date.getTime(); });
          html += '<div class="loe-row"><span class="loe-dot" style="background:' + s.color + '"></span>' +
            esc(s.label) + ' : <b>' + esc(p ? p.rendered : "∅") + "</b></div>";
        });
        if (evByDate[+d.date]) {
          html += eventTipHtml(evByDate[+d.date], true);
        }
        showTip(html, evt);
      }).on("mouseleave", function () { hideTip(); guide.style("opacity", 0); });

      // --- Hit-areas dédiées aux marqueurs (au-dessus de l'overlay) ---
      var gHit = g.append("g");
      events.forEach(function (ev) {
        var px = x(ev.date);
        gHit.append("rect").attr("x", px - 6).attr("y", 0).attr("width", 12).attr("height", ih)
          .style("fill", "transparent").style("cursor", "pointer")
          .on("mouseenter", function () { guide.attr("x1", px).attr("x2", px).style("opacity", 1); })
          .on("mousemove", function (evt) {
            var html = '<div class="loe-date">' + esc(ev.xLabel) + "</div>" + eventTipHtml(ev, false);
            showTip(html, evt);
          })
          .on("mouseleave", function () { hideTip(); guide.style("opacity", 0); });
      });

      // --- Légende ---
      var leg = svg.append("g").attr("class", "loe-legend").attr("transform", "translate(" + m.left + "," + (H - 16) + ")");
      var lx = 0;
      seriesDefs.forEach(function (s) {
        var gi = leg.append("g").attr("transform", "translate(" + lx + ",0)");
        gi.append("line").attr("x1", 0).attr("x2", 22).attr("y1", -4).attr("y2", -4).attr("stroke", s.color).attr("stroke-width", 3);
        var t = gi.append("text").attr("x", 28).attr("y", 0).text(s.label);
        lx += 28 + (s.label.length * 6.6) + 24;
        t.each(function () { lx = lx; });
      });
      if (events.length) {
        var ge = leg.append("g").attr("transform", "translate(" + lx + ",0)");
        ge.append("line").attr("x1", 0).attr("x2", 22).attr("y1", -4).attr("y2", -4)
          .attr("stroke", mColor).attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
        ge.append("text").attr("x", 28).attr("y", 0).text("Changement d'optimizer");
      }
    }
  }
});
