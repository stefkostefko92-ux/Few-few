'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/Field';

/** Избор на активен профил (акаунти с няколко профила): води към ?p=<id>. */
export function ProfileSwitcher({
  label,
  options,
  value,
  basePath,
}: {
  label: string;
  options: { id: string; slug: string }[];
  value?: string;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="profile-switch" className="sr-only">
        {label}
      </label>
      <Select
        id="profile-switch"
        value={value}
        onChange={(event) => router.push(`${basePath}?p=${event.target.value}`)}
        className="h-9 w-auto max-w-[11rem] py-0 text-small font-semibold sm:max-w-[16rem]"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            /{option.slug}
          </option>
        ))}
      </Select>
    </>
  );
}
