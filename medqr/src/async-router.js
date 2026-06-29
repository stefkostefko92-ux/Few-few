import { Router } from 'express';

// Express 4 не пренасочва отхвърлени промиси от `async` обработчици към error
// middleware — необработеното отхвърляне сваля процеса (Node ≥15). Този помощник
// връща Router, чиито маршрутни методи автоматично обвиват async обработчиците в
// `.catch(next)`, така че всяка грешка стига до централния error handler.
const VERBS = ['get', 'post', 'put', 'delete', 'patch', 'all'];

const wrap = (h) =>
  typeof h === 'function' && h.constructor && h.constructor.name === 'AsyncFunction'
    ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
    : h;

export function asyncRouter() {
  const router = Router();
  for (const verb of VERBS) {
    const original = router[verb].bind(router);
    router[verb] = (path, ...handlers) => original(path, ...handlers.map(wrap));
  }
  return router;
}
