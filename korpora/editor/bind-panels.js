// The controls inside the tabs: the copy buttons, the part, drawing and sheet pickers, the CNC simulation.
import { $, copyText } from './dom.js';
import { cutListCsv, hardwareCsv } from '../engine/bom.js';
import { drillCsv } from '../engine/drill.js';
import { renderDrillPart } from './render-drill.js';
import { renderDrawing } from './render-draw.js';
import { renderCnc, drawToolpath, toggleSim, stopSim } from './render-cnc.js';

export function bindPanels(state, meta) {
  $('#copy-cut').addEventListener('click', (ev) =>
    copyText(cutListCsv(state.bom), ev.currentTarget),
  );
  $('#copy-hw').addEventListener('click', (ev) =>
    copyText(hardwareCsv(state.bom), ev.currentTarget),
  );
  $('#copy-drill').addEventListener('click', (ev) =>
    copyText(drillCsv(state.model), ev.currentTarget),
  );
  $('#drill-part').addEventListener('change', (ev) => {
    state.drillPart = ev.target.value;
    renderDrillPart(state, meta());
  });
  $('#draw-part').addEventListener('change', (ev) => {
    state.drawing = ev.target.value;
    renderDrawing(state, meta());
  });
  $('#copy-svg').addEventListener('click', (ev) => copyText(state.svg ?? '', ev.currentTarget));
  $('#cnc-sheet').addEventListener('change', (ev) => {
    state.sheet = Number(ev.target.value);
    renderCnc(state, meta());
  });
  $('#sim-progress').addEventListener('input', (ev) => {
    stopSim();
    state.progress = Number(ev.target.value) / Number(ev.target.max); // the scale is the slider's own max
    drawToolpath(state);
  });
  $('#sim-play').addEventListener('click', () => toggleSim(state));
  $('#copy-gcode').addEventListener('click', (ev) =>
    copyText(state.gcode?.text ?? '', ev.currentTarget, $('#gcode')),
  );
  $('#copy-dxf').addEventListener('click', (ev) =>
    copyText(state.dxf?.text ?? '', ev.currentTarget, $('#dxf')),
  );
}
