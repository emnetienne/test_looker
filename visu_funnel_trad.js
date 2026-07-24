looker.plugins.visualizations.add({
  // Default visualization configuration options shown in Looker UI
  options: {
    stageColors: {
      type: "array",
      label: "Custom Stage Colors (Comma-separated)",
      default: ["#FF6B52", "#4A7C59", "#80B342", "#B0B3B8", "#FF8A65", "#FFF566"],
      section: "Style"
    }
  },

  create: function (element, config) {
    element.innerHTML = `
      <style>
        .funnel-container {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Arial, sans-serif;
          box-sizing: border-box;
          padding: 10px;
        }
        .funnel-svg {
          width: 100%;
          height: 100%;
        }
        .funnel-text-val {
          font-size: 26px;
          font-weight: bold;
        }
        .funnel-text-label {
          font-size: 13px;
          fill: #555555;
        }
        .connector-line {
          stroke: #1B365D;
          stroke-width: 2;
        }
      </style>
      <div class="funnel-container">
        <svg class="funnel-svg" id="funnelSvg"></svg>
      </div>
    `;
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    if (!data || data.length === 0) {
      this.addError({
        title: "No Data",
        message: "This visualization requires data rows or measures."
      });
      return;
    }

    const svg = element.querySelector("#funnelSvg");
    svg.innerHTML = ""; // Clear existing render

    // Format data into stages array [{ label, value }, ...]
    let stages = [];

    // Case 1: Data comes as multiple measure columns in a single row
    if (data.length === 1 && queryResponse.fields.measure_like.length > 1) {
      const row = data[0];
      queryResponse.fields.measure_like.forEach((field) => {
        stages.push({
          label: field.label_short || field.label,
          value: row[field.name]?.value || 0
        });
      });
    } else {
      // Case 2: Data comes as rows (1 Dimension column, 1 Measure column)
      const dimKey = queryResponse.fields.dimension_like[0]?.name;
      const measureKey = queryResponse.fields.measure_like[0]?.name;

      stages = data.map((row) => ({
        label: dimKey ? row[dimKey]?.value : "Stage",
        value: measureKey ? row[measureKey]?.value : 0
      }));
    }

    const totalStages = stages.length;
    if (totalStages === 0) return;

    // Dimensions for SVG rendering
    const width = 800;
    const height = 500;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const colors = config.stageColors || [
      "#FF6B52",
      "#4A82C4",
      "#7CB342",
      "#B0B3B8",
      "#FF8A65",
      "#FFF566"
    ];

    // --- ADJUSTED LAYOUT PARAMETERS ---
    const textRightX = 320;        // Position where text ends
    const funnelLeftX = 350;       // Funnel starts closer to labels
    const funnelRightX = 780;      // Funnel extends further to the right edge
    const funnelTopWidth = funnelRightX - funnelLeftX;
    const minBottomWidth = 40;     // Width at the tip of the funnel
    const stageHeight = height / totalStages;

    stages.forEach((stage, index) => {
      const topY = index * stageHeight;
      const bottomY = (index + 1) * stageHeight;

      // Calculate tapering width at top and bottom of this stage section
      const topTaper = index / totalStages;
      const bottomTaper = (index + 1) / totalStages;

      const topWidth =
        funnelTopWidth - topTaper * (funnelTopWidth - minBottomWidth);
      const bottomWidth =
        funnelTopWidth - bottomTaper * (funnelTopWidth - minBottomWidth);

      const topX1 = funnelLeftX + (funnelTopWidth - topWidth) / 2;
      const topX2 = topX1 + topWidth;
      const bottomX1 = funnelLeftX + (funnelTopWidth - bottomWidth) / 2;
      const bottomX2 = bottomX1 + bottomWidth;

      const stageColor = colors[index % colors.length];

      // 1. Draw Funnel Trapezium Polygon
      const polygon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polygon"
      );
      polygon.setAttribute(
        "points",
        `${topX1},${topY} ${topX2},${topY} ${bottomX2},${bottomY} ${bottomX1},${bottomY}`
      );
      polygon.setAttribute("fill", stageColor);
      svg.appendChild(polygon);

      // Mid Y for annotations & lines
      const midY = topY + stageHeight / 2;

      // 2. Dynamic Connector Line
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      line.setAttribute("x1", textRightX + 10);
      line.setAttribute("y1", midY);
      line.setAttribute("x2", topX1 - 8);
      line.setAttribute("y2", midY);
      line.setAttribute("class", "connector-line");
      svg.appendChild(line);

      // 3. Metric Value Text
      const textVal = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      textVal.setAttribute("x", textRightX);
      textVal.setAttribute("y", midY - 6);
      textVal.setAttribute("text-anchor", "end");
      textVal.setAttribute("fill", stageColor);
      textVal.setAttribute("class", "funnel-text-val");
      textVal.textContent = Number(stage.value).toLocaleString();
      svg.appendChild(textVal);

      // 4. Metric Label Text
      const textLabel = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      textLabel.setAttribute("x", textRightX);
      textLabel.setAttribute("y", midY + 14);
      textLabel.setAttribute("text-anchor", "end");
      textLabel.setAttribute("class", "funnel-text-label");
      textLabel.textContent = stage.label;
      svg.appendChild(textLabel);
    });

    done();
  }
});
