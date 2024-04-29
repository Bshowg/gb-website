

function appendMap(){

    const newYorkCoords = [11.2577,43.7700]; // Longitude, Latitude
const svg = d3.select("#map"),
    width = +svg.style("width").replace("px", ""),
    height = +svg.style("height").replace("px", "");

    const projection = d3.geoOrthographic()
    .scale(height / 2.1) // Adjust scale to fit the SVG container
    .translate([width / 2, height / 2])
    .clipAngle(90); // Clip the back half of the globe

const path = d3.geoPath().projection(projection);

const graticule = d3.geoGraticule();



svg.append('path')
    .datum(graticule())
    .attr('class', 'graticule')
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 0.5);

const marker = svg.append("circle")
    .attr('cx', projection(newYorkCoords)[0])
    .attr('cy', projection(newYorkCoords)[1])
    .attr('r', 3) // radius of the marker
    .attr('fill', 'red'); // color of the marker
// Load and draw the world
d3.json('https://enjalot.github.io/wwsd/data/world/world-110m.geojson').then(world => {
    svg.selectAll('path.land')
        .data(world.features)
        .enter().append('path')
        .attr('class', 'land')
        .attr('d', path)
        .attr('fill', 'blacktransparent');

    svg.selectAll('.land')
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5);
});

// Dragging functionality
function dragstarted(event) {
    dragCoords = [event.x, event.y];
    dragRotation = [...projection.rotate()];
}

function dragged(event) {
    const rotate = projection.rotate();
    const k = sensitivity / projection.scale();
    projection.rotate([
        dragRotation[0] + (event.x - dragCoords[0]) * k,
        dragRotation[1] - (event.y - dragCoords[1]) * k
    ]);
    svg.selectAll('path').attr('d', path);
    updateMarker();
}

function dragended(event) {
    // You can implement any clean-up or state-update logic here
}

function updateMarker() {
    const coords = projection(newYorkCoords);
    marker.attr('cx', coords[0])
          .attr('cy', coords[1]);

    // Hide the marker if it's behind the globe
    const c = d3.geoCircle().center(newYorkCoords).radius(90)();
    const circlePath = path(c);
    if (!circlePath) {
        marker.style('display', 'none');
    } else {
        marker.style('display', 'inline');
    }
}

const sensitivity = 100;
const drag = d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);

svg.call(drag);
}
