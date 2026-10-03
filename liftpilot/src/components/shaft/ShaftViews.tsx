// The plan at the main floor and section A-A of a shaft design, drawn by the drawing kernel on white paper: the same
// views as the drawing set, cropped for the screen. No state: renders on the server and in the designer.
import type { Layout } from '@/shaft';
import { previews } from '@/lib/tavole/views';
import DrawingFigure from '@/components/drawing/DrawingFigure';
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
      <DrawingFigure className="sheet-view" w={plan.w} h={plan.h} label={planLabel} caption={scaleText(plan.scale)}>
        <ShapesSvg shapes={plan.shapes} w={plan.w} h={plan.h} id={`${id}-plan`} label={planLabel} />
      </DrawingFigure>
      {section ? (
        <DrawingFigure className="sheet-view sheet-view-tall" w={section.w} h={section.h} label={sectionLabel} caption={scaleText(section.scale)}>
          <ShapesSvg shapes={section.shapes} w={section.w} h={section.h} id={`${id}-sec`} label={sectionLabel} />
        </DrawingFigure>
      ) : null}
    </div>
  );
}
