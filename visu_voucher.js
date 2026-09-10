looker.plugins.visualizations.add({
  id: "vouchers_tickets",
  label: "Bons d'achat (tickets)",
  options: {
    ticketColor: {
      type: "string", display: "color", label: "Couleur ticket",
      default: "#0F6E56", section: "Style", order: 1
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
          display: flex; align-items: center;
          font-family: Arial, Helvetica, sans-serif; color: #2b2b2b; padding: 8px 16px; }
        .vt-content { width: 100%; }
        .vt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
        .vt-ticket { display: flex; background: #ffffff; border: 1px solid #e3e2dc;
          border-radius: 12px; overflow: hidden; min-height: 92px; }
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

    function esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
    function cellText(cell) {
      if (!cell) return "";
      return cell.rendered != null ? cell.rendered : cell.value;
    }

    // Parse UN nombre : "50 €" -> 50 ; "1 234,50 €" -> 1234.5
    function parseNumber(str) {
      if (str == null) return null;
      var s = String(str).replace(/ /g, " ").replace(/\s/g, "");
      s = s.replace(/[^0-9.,-]/g, "");
      if (s === "" || !/\d/.test(s)) return null;
      if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/\./g, "").replace(",", ".");
      else if (s.indexOf(",") > -1) s = s.replace(",", ".");
      var n = parseFloat(s);
      return isNaN(n) ? null : n;
    }

    // Un fragment est "purement montant" s'il ne contient que chiffres,
    // séparateurs et symbole monétaire (pas de texte).
    function isPureAmount(part) {
      var s = String(part).replace(/ /g, " ").replace(/[€$£¥]/g, "").trim();
      if (!/\d/.test(s)) return false;
      return !/[A-Za-zÀ-ſ]/.test(s);
    }

    // Valeur d'UN bon, en gérant les libellés multiplicatifs :
    //   "5 €"      -> 5
    //   "4 x 50€"  -> 200   (et non 450, bug corrigé)
    //   "2 × 10 €" -> 20
    //   "3*25€"    -> 75
    function parseAmount(label) {
      if (label == null) return null;
      var raw = String(label).replace(/ /g, " ");
      var parts = raw.split(/[x×X*]/);
      // Multiplication reconnue uniquement si TOUS les fragments sont des montants.
      // ("Bon max 50 €" -> repli sur le parsing simple = 50)
      if (parts.length >= 2 && parts.every(isPureAmount)) {
        var product = 1;
        for (var i = 0; i < parts.length; i++) {
          var n = parseNumber(parts[i]);
          if (n == null) return parseNumber(raw);
          product *= n;
        }
        return product;
      }
      return parseNumber(raw);
    }

    function fmt(n) {
      return Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    }

    var rows = data.map(function (row) {
      var label = cellText(row[dimKey]);
      var count = row[measKey] ? Number(row[measKey].value) || 0 : 0;
      var amount = parseAmount(label);
      return { label: label, count: count, amount: amount };
    });

    var html = '<div class="vt-grid">';
    rows.forEach(function (r) {
      var countLabel = (r.count === 1) ? "bon distribué" : "bons distribués";
      html += '<div class="vt-ticket">';
      html += '<div class="vt-panel" style="background:' + esc(ticketColor) + '">' +
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
