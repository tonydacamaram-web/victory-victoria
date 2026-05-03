-- Políticas UPDATE para transacciones e items (admin/supervisor)
-- Ejecutar en el SQL Editor de Supabase

-- transacciones: UPDATE
DROP POLICY IF EXISTS "Admins pueden actualizar transacciones" ON transacciones;
CREATE POLICY "Admins pueden actualizar transacciones"
  ON transacciones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid()
        AND rol IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid()
        AND rol IN ('admin', 'supervisor')
    )
  );

-- items_transaccion: UPDATE
DROP POLICY IF EXISTS "Admins pueden actualizar items transaccion" ON items_transaccion;
CREATE POLICY "Admins pueden actualizar items transaccion"
  ON items_transaccion FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid()
        AND rol IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid()
        AND rol IN ('admin', 'supervisor')
    )
  );
