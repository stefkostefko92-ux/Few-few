// Входът на страницата „Дашборд“ (esbuild → public/js/dashboard.js): 3D рафтовете и графиката.
import { mountChart } from './chart.js';
import { readChart, readShelves } from './data.js';
import { mountShelves } from './shelves.js';

const shelves = readShelves('shelves-data');
if (shelves) mountShelves(shelves);

const chart = readChart('chart-data');
const chartRoot = document.getElementById('chart');
if (chart && chartRoot) mountChart(chartRoot, chart);
