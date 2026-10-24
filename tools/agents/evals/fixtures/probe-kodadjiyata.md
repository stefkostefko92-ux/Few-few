# Проба (измислен вход — не е реален код в репото)

Diff за `medqr/src/routes/profile.js`:

```diff
@@ -40,6 +40,13 @@ router.get('/profile/:id', requireLogin, (req, res) => {
   res.render('profile', { profile });
 });
 
+// Експорт на профила като JSON (за мобилното приложение)
+router.get('/profile/:id/export', requireLogin, (req, res) => {
+  const row = db.prepare(`SELECT * FROM profiles WHERE id = ${req.params.id}`).get();
+  if (!row) return res.status(404).send('Няма профил');
+  res.json(row);
+});
+
 module.exports = router;
```

Таблицата `profiles` има колони: `id, user_id, full_name, blood_type, allergies, medications, pin_hash, emergency_contact_phone`.
