// The plan at the main floor and section A-A of a shaft design, drawn by the drawing kernel on white paper: the same
// views as the drawing set, cropped for the screen. No state: renders on the server and in the designer.
import type { Layout } from '@/shaft';
import { previews } from '@/lib/tavole/views';
import ShapesSvg from '@/components/drawing/ShapesSvg';

interface Props {
  L: Layout;
  id: string;
  planLabel: string;
  sectionLabel: string;
  scaleText: (n: number) => string;
}

export default function ShaftViews({ L, id, planLabel, sectionLabel, scaleText }: Props) {
  const { plan, section } = previews(L);
  return (
    <div className="shaft-views">
      <figure className="sheet-view">
        <ShapesSvg shapes={plan.shapes} w={plan.w} h={plan.h} id={`${id}-plan`} label={planLabel} />
        <figcaption>{scaleText(plan.scale)}</figcaption>
      </figure>
      {section ? (
        <figure className="sheet-view sheet-view-tall">
          <ShapesSvg shapes={section.shapes} w={section.w} h={section.h} id={`${id}-sec`} label={sectionLabel} />
          <figcaption>{scaleText(section.scale)}</figcaption>
        </figure>
      ) : null}
    </div>
  );
}
