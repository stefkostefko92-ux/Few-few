// frontend/src/components/SectionHead.jsx
// Заглавие на секция на лендинга — без шаблонния етикет „→ НЕЩО“ отгоре и
// без една дума в лайм (визуалният одит 07.10.2026: така изглеждаше всяка от
// 11-те секции). Подравняването е избор на секцията, за да има ритъм.
export default function SectionHead({ title, sub, align = "left", size = "lg", className = "" }) {
  const center = align === "center";
  const sizes = { lg: "text-4xl sm:text-5xl", md: "text-3xl sm:text-4xl" };
  return (
    <div data-reveal className={`${center ? "text-center mx-auto" : ""} max-w-3xl mb-12 ${className}`}>
      <h2 className={`font-display font-black ${sizes[size]} text-cs-text leading-[1.02] tracking-tight text-balance`}>{title}</h2>
      {sub && <p className={`text-cs-muted text-lg mt-4 text-pretty ${center ? "mx-auto" : ""} max-w-2xl`}>{sub}</p>}
    </div>
  );
}
