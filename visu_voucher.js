looker.plugins.visualizations.add({
  id: "vouchers_tickets",
  label: "Bons d'achat (tickets)",
  options: {
    ticketColor: {
      type: "string", display: "color", label: "Couleur ticket",
      default: "#0F6E56", section: "Style", order: 1
    },
    highlightColor: {
      type: "string", display: "color", label: "Couleur lot principal",
      default: "#BA7517", section: "Style", order: 2
    },
    showSummary: {
      type: "boolean", label: "Afficher la synthèse",
      default: true, section: "Style", order: 3
    },
    highlightTop: {
      type: "boolean", label: "Mettre en avant le plus gros bon",
      default: true, section: "Style", order: 4
    },
    currency: {
      type: "string", label: "Symbole monétaire",
      default: "€", section: "Valeur", order: 1
    }
  },

  create: function (element, config) {
    element.innerHTML = `
      <style>
        .vt-wrap { box-sizing: border-box; width: 100%; height: 100%; overflow: auto;
          font-family: Arial, Helvetica, sans-serif; color: #2b2b2b; padding: 16px; }
        .vt-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px; margin-bottom: 20px; }
        .vt-metric { background: #f4f3ef; border-radius: 8px; padding: 14px 16px; }
        .vt-metric-label { font-size: 13px; color: #6b6b6b; margin-bottom: 6px; }
        .vt-metric-value { font-size: 24px; font-weight: bold; color: #2b2b2b; line-height: 1.1; }
        .vt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
        .vt-ticket { display: flex; background: #ffffff; border: 1px solid #e3e2dc;
          border-radius: 12px; overflow: hidden; min-height: 92px; position: relative; }
        .vt-ticket.vt-top { border: 2px solid; }
        .vt-panel { display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 16px 14px; min-width: 82px; color: #ffffff; }
        .vt-panel-amount { font-size: 22px; font-weight: bold; line-height: 1.1; text-align: center; }
        .vt-panel-sub { font-size: 12px; opacity: 0.9; margin-top: 2px; }
        .vt-body { flex: 1; padding: 14px 18px; border-left: 2px dashed #e3e2dc; }
        .vt-count { font-size: 30px; font-weight: bold; color: #2b2b2b; line-height: 1; }
        .vt-count-label { font-size: 13px; color: #6b6b6b; margin-top: 4px; }
        .vt-total { font-size: 13px; color: #6b6b6b; margin-top: 10px; padding-top: 10px;
          border-top: 1px solid #eeede8; }
        .vt-total strong { color: #2b2b2b; font-weight: bold; }
        .vt-badge { position: absolute; top: 8px; right: 8px; font-size: 11px;
          padding: 3px 8px; border-radius: 6px; color: #ffffff; }
      </style>
      <div class="vt-wrap"><div class="vt-content"></div></div>
    `;
    this._content = element.querySelector(".vt-content");
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    var dims = queryResponse.fields.dimension_like || [];
    var meas = queryResponse.fields.measure_like || [];
    if (!data || data.length === 0 || dims.length === 0 || meas.length === 0) {
      this.addError({
        title: "Données requises",
        message: "Cette visualisation attend 1 dimension (montant du bon) et 1 mesure (nombre distribué)."
      });
      return;
    }

    var dimKey = dims[0].name;
    var measKey = meas[0].name;
    var currency = (config.currency != null && config.currency !== "") ? config.currency : "€";
    var ticketColor = config.ticketColor || "#0F6E56";
    var highlightColor = config.highlightColor || "#BA7517";

    function esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
    function cellText(cell) {
      if (!cell) return "";
      return cell.rendered != null ? cell.rendered : cell.value;
    }
    function parseAmount(str) {
      if (str == null) return null;
      var s = String(str).replace(/\u00a0/g, " ").replace(/\s/g, "");
      s = s.replace(/[^0-9.,-]/g, "");
      if (s === "") return null;
      if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/\./g, "").replace(",", ".");
      else if (s.indexOf(",") > -1) s = s.replace(",", ".");
      var n = parseFloat(s);
      return isNaN(n) ? null : n;
    }
    function fmt(n) { return Number(n).toLocaleString("fr-FR"); }

    var rows = data.map(function (row) {
      var label = cellText(row[dimKey]);
      var count = row[measKey] ? Number(row[measKey].value) || 0 : 0;
      var amount = parseAmount(label);
      return { label: label, count: count, amount: amount };
    });

    var totalCount = rows.reduce(function (a, r) { return a + r.count; }, 0);
    var totalValue = 0, hasValue = false;
    rows.forEach(function (r) {
      if (r.amount != null) { totalValue += r.amount * r.count; hasValue = true; }
    });

    var topIndex = -1;
    if (config.highlightTop !== false) {
      var maxAmt = -Infinity;
      rows.forEach(function (r, i) {
        if (r.amount != null && r.amount > maxAmt) { maxAmt = r.amount; topIndex = i; }
      });
    }

    var html = "";

    if (config.showSummary !== false) {
      html += '<div class="vt-summary">';
      html += '<div class="vt-metric"><div class="vt-metric-label">Bons distribués</div>' +
              '<div class="vt-metric-value">' + fmt(totalCount) + '</div></div>';
      if (hasValue) {
        html += '<div class="vt-metric"><div class="vt-metric-label">Valeur totale distribuée</div>' +
                '<div class="vt-metric-value">' + fmt(totalValue) + ' ' + esc(currency) + '</div></div>';
      }
      html += '<div class="vt-metric"><div class="vt-metric-label">Paliers de gain</div>' +
              '<div class="vt-metric-value">' + fmt(rows.length) + '</div></div>';
      html += '</div>';
    }

    html += '<div class="vt-grid">';
    rows.forEach(function (r, i) {
      var isTop = (i === topIndex);
      var panelBg = isTop ? highlightColor : ticketColor;
      var countLabel = (r.count === 1) ? "bon distribué" : "bons distribués";

      html += '<div class="vt-ticket' + (isTop ? ' vt-top' : '') + '"' +
              (isTop ? ' style="border-color:' + esc(highlightColor) + '"' : '') + '>';
      if (isTop) {
        html += '<div class="vt-badge" style="background:' + esc(highlightColor) + '">Lot principal</div>';
      }
      html += '<div class="vt-panel" style="background:' + esc(panelBg) + '">' +
                '<span class="vt-panel-amount">' + esc(r.label) + '</span>' +
                '<span class="vt-panel-sub">par bon</span>' +
              '</div>';
      html += '<div class="vt-body">' +
                '<div class="vt-count">' + fmt(r.count) + '</div>' +
                '<div class="vt-count-label">' + countLabel + '</div>';
      if (r.amount != null) {
        html += '<div class="vt-total">Soit <strong>' + fmt(r.amount * r.count) + ' ' + esc(currency) + '</strong></div>';
      }
      html += '</div></div>';
    });
    html += '</div>';

    this._content.innerHTML = html;
    done();
  }
});
