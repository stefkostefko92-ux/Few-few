import Sidebar from "@/components/Sidebar";
import BannerContesto from "@/components/BannerContesto";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* `min-w-0` НЕ е козметика: flex елементът по подразбиране не се свива
          под ширината на съдържанието си, тоест широка таблица раздуваше
          `main` отвъд екрана, а коренът с `overflow-hidden` я режеше. Горният
          отстъп под `lg` оставя място за фиксираната лента с менюто. */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 pt-[4.5rem] sm:p-6 sm:pt-20 lg:p-8">
        <BannerContesto />
        {children}
      </main>
    </div>
  );
}
