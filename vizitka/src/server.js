import app from './app.js';

const port = Number(process.env.PORT || 3100);
app.listen(port, () => {
  console.log(`Vizitka слуша на http://localhost:${port}`);
});
