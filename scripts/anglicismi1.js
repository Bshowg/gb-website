
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", (event) => {
        barAnglicismi();
    });
} else {
    // DOMContentLoaded has already fired
    barAnglicismi();
}

  function barAnglicismi(){
    console.log("eccomi")
    const data=[{anno:"1990",numero:1700},{anno:"2017",numero:3400},{anno:"2020",numero:3958}]
    var margin = {top: 20, right: 30, bottom: 40, left: 90},
    width = 460 - margin.left - margin.right,
    height = 400 - margin.top - margin.bottom;
    const svg = d3.select("#barDevotoOli").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform",
          "translate(" + margin.left + "," + margin.top + ")");

      // Add X axis
      var x = d3.scaleLinear()
      .domain([0, d3.max(data, function(d) { return d.numero; })])
      .range([0, width]);
svg.append("g")
  .attr("transform", "translate(0," + height + ")")
  .call(d3.axisBottom(x))
  .selectAll("text")
    .attr("transform", "translate(-10,0)rotate(-45)")
    .style("text-anchor", "end");

// Y axis
var y = d3.scaleBand()
  .range([ 0, height ])
  .domain(data.map(function(d) { return d.anno; }))
svg.append("g")
  .call(d3.axisLeft(y))

  svg.selectAll("myRect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", x(0) )
    .attr("y", function(d) { return y(d.anno); })
    .attr("width", function(d) { return x(d.numero); })
    .attr("height", y.bandwidth() )
    .attr("fill", "white")
  }