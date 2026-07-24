looker.plugins.visualizations.add({
  options: {
    stageColors: {
      type: "array",
      label: "Custom Stage Colors (Comma-separated)",
      default: ["#FF6B52", "#4A7C59", "#80B342", "#B0B3B8", "#FF8A65", "#FFF566"],
      section: "Style"
    }
  },

  create: function (element, config) {
    // 1. Force Looker's root wrapper element to occupy 100% height and zero margin
    element.style.height = "100%";
    element.style.width = "100%";
    element.style.padding = "0px";
    element.style.margin = "0px";
    element.style.display = "flex";
    element.style.overflow = "hidden";

    element.innerHTML = `
      <style>
        .funnel-container {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: stretch;
          justify-content: stretch;
          font-family: Arial, sans-serif;
          box-sizing: border-box;
          padding: 0;
          margin: 0;
          overflow: hidden;
        }
        .funnel-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .funnel-text-val {
          font-size: 28px;
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

    // Ensure root element retains full height on data update
    element.style.height = "100%";

    const svg = element.querySelector("#funnelSvg");
    svg.innerHTML = ""; // Clear existing render

    // Format data into stages array [{ label, value }, ...]
    let stages = [];

    if (data.length === 1 && queryResponse.fields.measure_like.length > 1) {
      const row = data[0];
      queryResponse.fields.measure_like.forEach((field) => {
        stages.push({
          label: field.label_short || field.label,
          value: row[field.name]?.value || 0
        });
      });
    } else {
      const dimKey = queryResponse.fields.dimension_like[0]?.name;
      const measureKey = queryResponse.fields.measure_like[0]?.name;

      stages = data.map((row) => ({
        label: dimKey ? row[dimKey]?.value : "Stage",
        value: measureKey ? row[measureKey]?.value : 0
      }));
    }

    const totalStages = stages.length;
    if (totalStages === 0) return;

    // Canvas coordinate space
    const width = 800;
    const height = 600;
    
    // Stretch SVG coordinates to fill 100% of tile vertical space
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");

    const colors = config.stageColors || [
      "#FF6B52",
      "#4A82C4",
      "#7CB342",
      "#B0B3B8",
      "#FF8A65",
      "#FFF566"
    ];

    const funnelLeftX = 380;
    const funnelRightX = 760;
    const funnelTopWidth = funnelRightX - funnelLeftX;
    const minBottomWidth = 30;
    const stageHeight = height / totalStages;

    stages.forEach((stage, index) => {
      const topY = index * stageHeight;
      const bottomY = (index + 1) * stageHeight;

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

      const midY = topY + stageHeight / 2;

      // 2. Connector Line
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      line.setAttribute("x1", "280");
      line.setAttribute("y1", midY);
      line.setAttribute("x2", topX1 - 5);
      line.setAttribute("y2", midY);
      line.setAttribute("class", "connector-line");
      svg.appendChild(line);

      // 3. Metric Value Text
      const textVal = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      textVal.setAttribute("x", "270");
      textVal.setAttribute("y", midY - 8);
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
      textLabel.setAttribute("x", "270");
      textLabel.setAttribute("y", midY + 14);
      textLabel.setAttribute("text-anchor", "end");
      textLabel.setAttribute("class", "funnel-text-label");
      textLabel.textContent = stage.label;
      svg.appendChild(textLabel);
    });

    done();
  }
});
