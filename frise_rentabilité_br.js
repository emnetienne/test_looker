/**
 * Frise de rentabilité — visualisation personnalisée Looker (Lucky Cart)
 *
 * Une flèche par opération (une ligne de résultat = une opération), avec
 * au-dessus ou en dessous, en alternance :
 *   - carte bleue   : Rentabilité estimée*
 *   - carte orange  : Rentabilité estimée* (marge déduite)
 * Le nombre de flèches suit le nombre d'opérations renvoyées par la requête,
 * donc le filtre du dashboard.
 *
 * Requête attendue dans la tuile :
 *   - 1re dimension      : nom de l'opération
 *   - 2e dimension (opt.): date de début (sert à l'ordre chronologique)
 *   - 2 valeurs numériques (measures ou calculs de table) : rentabilité,
 *     rentabilité marge déduite. Les champs dont le nom contient « rentab »
 *     sont détectés automatiquement ; sinon, à choisir dans les options.
 *   Les champs masqués (hidden_fields) restent lisibles par la visualisation.
 *
 * Installation : Admin > Visualisations > Ajouter, URL https du fichier,
 * id « frise_rentabilite ».
 */
(function () {
  var CSS = [
    '.fr-root{box-sizing:border-box;width:100%;height:100%;display:grid;',
    '  grid-template-rows:minmax(0,1fr) auto minmax(0,1fr);column-gap:var(--gap);',
    '  padding:8px 4px;font-family:"Poppins","Open Sans",Helvetica,Arial,sans-serif;overflow:hidden}',
    '.fr-root *{box-sizing:border-box}',
    '.fr-cell{display:flex;flex-direction:column;align-items:center;min-width:0}',
    '.fr-cell.top{justify-content:flex-start}',
    '.fr-cell.bottom{justify-content:flex-start}',
    '.fr-line{flex:1 1 auto;min-height:10px;width:2px;background:var(--line)}',
    '.fr-stack{display:flex;flex-direction:column;gap:calc(6px*var(--s));width:var(--cardw);flex:0 0 auto}',
    '.fr-card{background:#fff;border:1.5px solid;border-radius:calc(10px*var(--s));text-align:center;',
    '  padding:calc(5px*var(--s)) 6px calc(6px*var(--s))}',
    '.fr-card.roi{border-color:var(--blue-border)}',
    '.fr-card.marge{border-color:var(--orange)}',
    '.fr-val{font-weight:700;line-height:1.1;font-size:calc(26px*var(--s))}',
    '.fr-card.roi .fr-val{color:var(--blue)}',
    '.fr-card.marge .fr-val{color:var(--orange)}',
    '.fr-lab{font-weight:600;color:#555;line-height:1.2;font-size:calc(13px*var(--s))}',
    '.fr-sub{font-weight:600;color:#555;line-height:1.2;font-size:calc(9.5px*var(--s))}',
    '.fr-chev{position:relative;width:100%;min-height:calc(54px*var(--s));display:flex;align-items:center;',
    '  justify-content:center;text-align:center;color:#fff;background:var(--blue);font-weight:600;',
    '  font-size:calc(12.5px*var(--s));line-height:1.25;padding:6px calc(26px*var(--s));',
    '  clip-path:polygon(0 0,calc(100% - var(--tip)) 0,100% 50%,calc(100% - var(--tip)) 100%,0 100%,var(--tip) 50%)}',
    '.fr-chev.first{clip-path:polygon(0 0,calc(100% - var(--tip)) 0,100% 50%,calc(100% - var(--tip)) 100%,0 100%);',
    '  padding-left:calc(14px*var(--s))}',
    '.fr-chev span{overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}',
    '.fr-empty{grid-column:1/-1;grid-row:1/-1;display:flex;align-items:center;justify-content:center;color:#888;',
    '  font-size:13px}'
  ].join('\n');

  var BASE_OPTIONS = {
    couleur_principale: {
      section: 'Style', order: 1, type: 'string', display: 'color',
      label: 'Couleur flèches / rentabilité', default: '#2B55C1'
    },
    couleur_marge: {
      section: 'Style', order: 2, type: 'string', display: 'color',
      label: 'Couleur marge déduite', default: '#F4785F'
    },
    premiere_position: {
      section: 'Style', order: 3, type: 'string', display: 'select',
      label: 'Cartes de la 1re opération',
      values: [{ 'En dessous': 'bas' }, { 'Au-dessus': 'haut' }], default: 'bas'
    },
    decimales: {
      section: 'Valeurs', order: 1, type: 'number', label: 'Décimales', default: 1
    },
    separateur: {
      section: 'Valeurs', order: 2, type: 'string', display: 'select',
      label: 'Séparateur décimal', values: [{ 'Point (5.8)': '.' }, { 'Virgule (5,8)': ',' }], default: '.'
    },
    libelle_roi: {
      section: 'Libellés', order: 1, type: 'string', label: 'Libellé carte bleue',
      default: 'Rentabilité estimée*'
    },
    libelle_marge: {
      section: 'Libellés', order: 2, type: 'string', label: 'Libellé carte orange',
      default: 'Rentabilité estimée*'
    },
    sous_libelle_marge: {
      section: 'Libellés', order: 3, type: 'string', label: 'Sous-libellé carte orange',
      default: '(marge déduite)'
    },
    retirer_prefixe: {
      section: 'Libellés', order: 4, type: 'boolean',
      label: 'Retirer le début de nom commun à toutes les opérations', default: false
    },
    ordre: {
      section: 'Données', order: 1, type: 'string', display: 'select', label: 'Ordre des opérations',
      values: [{ 'Date (2e dimension)': 'date' }, { 'Ordre de la requête': 'requete' }], default: 'date'
    }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(v, dec, sep) {
    if (v == null || v === '' || isNaN(v) || !isFinite(v)) return '–';
    var s = Number(v).toFixed(Math.max(0, Math.min(6, dec | 0)));
    return sep === ',' ? s.replace('.', ',') : s;
  }

  function cellValue(row, name) {
    var c = row[name];
    if (c == null) return null;
    return c.value;
  }

  // Coupe le début commun aux noms, sur une frontière « - ».
  function stripCommonPrefix(names) {
    if (names.length < 2) return names;
    var p = names[0];
    names.forEach(function (n) {
      var i = 0;
      while (i < p.length && i < n.length && p[i] === n[i]) i++;
      p = p.slice(0, i);
    });
    var cut = p.lastIndexOf(' - ');
    if (cut < 0) return names;
    return names.map(function (n) { return n.slice(cut + 3) || n; });
  }

  function pickDefault(numeric, wantMarge) {
    var match = numeric.filter(function (f) {
      var t = (f.name + ' ' + (f.label || '')).toLowerCase();
      return /rentab|roi/.test(t) && (/marge/.test(t) === wantMarge);
    });
    if (match.length) return match[0].name;
    return numeric[wantMarge ? 1 : 0] ? numeric[wantMarge ? 1 : 0].name : '';
  }

  looker.plugins.visualizations.add({
    id: 'frise_rentabilite',
    label: 'Frise de rentabilité',
    options: BASE_OPTIONS,

    create: function (element) {
      element.innerHTML = '<style>' + CSS + '</style><div class="fr-root"></div>';
      this._root = element.querySelector('.fr-root');
      this._optionsKey = null;
    },

    updateAsync: function (data, element, config, queryResponse, details, done) {
      this.clearErrors();
      var fields = queryResponse.fields || {};
      var dims = fields.dimension_like || fields.dimensions || [];
      var numeric = [].concat(fields.measure_like || fields.measures || [], fields.table_calculations || [])
        .filter(function (f) { return f.is_numeric !== false; });

      if (!dims.length) {
        this.addError({ title: 'Dimension manquante', message: 'Ajoutez le nom de l\'opération en 1re dimension.' });
        return done();
      }
      if (!numeric.length) {
        this.addError({ title: 'Valeur manquante', message: 'Ajoutez la rentabilité estimée (measure ou calcul de table).' });
        return done();
      }

      // Sélecteurs de champs, enregistrés quand la liste des champs change.
      var choices = numeric.map(function (f) {
        var o = {}; o[f.label_short || f.label || f.name] = f.name; return o;
      });
      var key = numeric.map(function (f) { return f.name; }).join('|');
      var defRoi = pickDefault(numeric, false);
      var defMarge = pickDefault(numeric, true);
      if (key !== this._optionsKey) {
        this._optionsKey = key;
        var opts = Object.assign({}, BASE_OPTIONS, {
          champ_roi: {
            section: 'Données', order: 2, type: 'string', display: 'select',
            label: 'Champ rentabilité', values: choices, default: defRoi
          },
          champ_marge: {
            section: 'Données', order: 3, type: 'string', display: 'select',
            label: 'Champ rentabilité marge déduite', values: choices, default: defMarge
          }
        });
        this.trigger('registerOptions', opts);
      }

      var c = {};
      Object.keys(BASE_OPTIONS).forEach(function (k) {
        c[k] = config[k] != null ? config[k] : BASE_OPTIONS[k].default;
      });
      var names = numeric.map(function (f) { return f.name; });
      var fRoi = names.indexOf(config.champ_roi) >= 0 ? config.champ_roi : defRoi;
      var fMarge = names.indexOf(config.champ_marge) >= 0 ? config.champ_marge : defMarge;
      var fName = dims[0].name;
      var fDate = dims[1] ? dims[1].name : null;

      var ops = data.map(function (row, i) {
        return {
          i: i,
          name: String(cellValue(row, fName) == null ? '' : cellValue(row, fName)),
          date: fDate ? cellValue(row, fDate) : null,
          roi: cellValue(row, fRoi),
          marge: fMarge ? cellValue(row, fMarge) : null
        };
      });
      if (c.ordre === 'date' && fDate) {
        ops.sort(function (a, b) {
          if (a.date == null) return 1;
          if (b.date == null) return -1;
          return a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i;
        });
      }
      var labels = ops.map(function (o) { return o.name; });
      if (c.retirer_prefixe) labels = stripCommonPrefix(labels);

      var n = ops.length;
      var root = this._root;
      var width = element.clientWidth || 800;
      var colW = n ? width / n : width;
      var s = Math.max(0.55, Math.min(1.15, colW / 250));
      root.style.setProperty('--s', s.toFixed(3));
      root.style.setProperty('--gap', Math.round(6 * s) + 'px');
      root.style.setProperty('--tip', Math.round(20 * s) + 'px');
      root.style.setProperty('--cardw', Math.round(Math.min(colW * 0.92, 240 * s)) + 'px');
      root.style.setProperty('--blue', c.couleur_principale);
      root.style.setProperty('--blue-border', c.couleur_principale + 'B3');
      root.style.setProperty('--line', c.couleur_principale + '80');
      root.style.setProperty('--orange', c.couleur_marge);
      root.style.gridTemplateColumns = 'repeat(' + Math.max(n, 1) + ',minmax(0,1fr))';

      if (!n) {
        root.innerHTML = '<div class="fr-empty">Aucune opération pour les filtres sélectionnés</div>';
        return done();
      }

      var dec = c.decimales, sep = c.separateur;
      var stack = function (o) {
        var h = '<div class="fr-stack">' +
          '<div class="fr-card roi"><div class="fr-val">' + fmt(o.roi, dec, sep) + '</div>' +
          '<div class="fr-lab">' + esc(c.libelle_roi) + '</div></div>';
        if (fMarge) {
          h += '<div class="fr-card marge"><div class="fr-val">' + fmt(o.marge, dec, sep) + '</div>' +
            '<div class="fr-lab">' + esc(c.libelle_marge) + '</div>' +
            (c.sous_libelle_marge ? '<div class="fr-sub">' + esc(c.sous_libelle_marge) + '</div>' : '') +
            '</div>';
        }
        return h + '</div>';
      };

      var firstDown = c.premiere_position !== 'haut';
      var html = '';
      ops.forEach(function (o, i) {
        var col = 'grid-column:' + (i + 1) + ';';
        var down = (i % 2 === 0) === firstDown;
        html += '<div class="fr-cell top" style="' + col + 'grid-row:1">' +
          (down ? '' : stack(o) + '<div class="fr-line"></div>') + '</div>';
        html += '<div style="' + col + 'grid-row:2;display:flex">' +
          '<div class="fr-chev' + (i === 0 ? ' first' : '') + '" title="' + esc(o.name) + '"><span>' +
          esc(labels[i]) + '</span></div></div>';
        html += '<div class="fr-cell bottom" style="' + col + 'grid-row:3">' +
          (down ? '<div class="fr-line"></div>' + stack(o) : '') + '</div>';
      });
      root.innerHTML = html;
      done();
    }
  });
})();
