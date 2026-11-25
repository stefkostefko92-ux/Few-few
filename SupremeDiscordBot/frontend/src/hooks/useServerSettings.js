// frontend/src/hooks/useServerSettings.js
// Формата за част от настройките на сървъра: зарежда, пази кое е променено и
// записва само своите полета (виж components/settings/fields.js).
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getServer, updateServer } from "../api";
import { useToast } from "../contexts/ToastContext";
import { useT } from "../contexts/I18nContext";
import { buildForm, buildPayload } from "../components/settings/fields";

export function useServerSettings(keys) {
  const { serverId } = useParams();
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: server, isError } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
  });

  // Формата помни ЗА КОЙ сървър е. Преди беше `if (server && !form)`: при смяна
  // на сървъра в адреса компонентът оставаше същият, формата — на стария сървър,
  // и „Запази“ записваше настройките на единия върху другия.
  const [state, setState] = useState({ serverId: null, form: null, saved: null });
  useEffect(() => {
    if (server && state.serverId !== serverId) {
      const form = buildForm(server, keys);
      setState({ serverId, form, saved: form });
    }
  }, [server, serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = state.serverId === serverId && !!state.form;
  const form = ready ? state.form : null;
  const dirty = useMemo(
    () => ready && JSON.stringify(state.form) !== JSON.stringify(state.saved),
    [ready, state.form, state.saved],
  );

  const mutation = useMutation({
    mutationFn: (data) => updateServer(serverId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", serverId] });
      // Страничната лента и списъкът със сървъри четат ДРУГ ключ ("servers").
      qc.invalidateQueries({ queryKey: ["servers"] });
      setState((s) => {
        // Токенът не остава във формата след запис.
        const next = "customBotToken" in s.form ? { ...s.form, customBotToken: "" } : s.form;
        return { ...s, form: next, saved: next };
      });
      toast.success(t("settings.saved"));
    },
    onError: (err) => toast.error(err?.response?.data?.error || t("settings.saveFailed")),
  });

  const set = (key, val) => setState((s) => ({ ...s, form: { ...s.form, [key]: val } }));
  const save = (e) => {
    e?.preventDefault();
    if (ready) mutation.mutate(buildPayload(state.form, server, keys));
  };

  return { serverId, server, form, set, save, mutation, dirty, ready, isError };
}
