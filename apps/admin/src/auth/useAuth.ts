import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchMe, login, logout } from '@/api/auth';
import type { Admin } from '@/api/types';

const ME_KEY = ['me'] as const;

/** Текущата сесия. При 401 връща data: undefined → показва екран за вход. */
export function useMe() {
  return useQuery<Admin>({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      login(vars.email, vars.password),
    onSuccess: (admin) => {
      queryClient.setQueryData(ME_KEY, admin);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries({ queryKey: ['reports'] });
      queryClient.removeQueries({ queryKey: ['report'] });
    },
  });
}

/** Само VIEWER е „само за четене"; MODERATOR и ADMIN могат да действат. */
export function canModerate(admin: Admin): boolean {
  return admin.role === 'MODERATOR' || admin.role === 'ADMIN';
}
