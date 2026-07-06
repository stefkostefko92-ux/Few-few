#!/usr/bin/env python3
"""genera_cad_v4.py — ФИНАЛЕН solid на Aletta (winglet), 100% NURBS/аналитичен.

Тяло: единична C2 BSpline повърхнина (skinning на 65 адаптивни X=const сечения) +
планарни капачки → солид.  По избор: изрязване на вътрешната кухина (X 99-113) като
булеан за да паснат вътрешните стени на скана.  Щифтове: аналитични револуции на
измерения стъпаловиден профил (M8, r≈3.95) по fit-натите оси, колар удължен навътре;
fuse; торови fillet-и в основите.  Експорт: STEP AP214 + BREP + STL (+ по избор).

Вход:  scripts/sections.npz  (от extract_sections.py)
Изход: cad/Aletta_v4.step / .brep, scratchpad body/full STL за грейдинг.

Флагове:
  --cavity     изрежи вътрешната кухина (булеан)
  --no-studs   само тяло
  --out PATH   базов път за изход (без разширение)
  --stl PATH   допълнителен STL
"""
from __future__ import annotations
import argparse, time
import numpy as np

from OCP.gp import gp_Pnt, gp_Dir, gp_Ax1, gp_Ax2, gp_Vec, gp_Pln
from OCP.TColgp import TColgp_Array2OfPnt, TColgp_HArray1OfPnt
from OCP.GeomAPI import GeomAPI_PointsToBSplineSurface, GeomAPI_Interpolate
from OCP.GeomAbs import GeomAbs_C2
from OCP.BRepBuilderAPI import (BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakeEdge,
    BRepBuilderAPI_MakeWire, BRepBuilderAPI_Sewing, BRepBuilderAPI_MakeSolid,
    BRepBuilderAPI_MakePolygon)
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepPrimAPI import BRepPrimAPI_MakeRevol
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.ShapeFix import ShapeFix_Solid, ShapeFix_Shape
from OCP.ShapeUpgrade import ShapeUpgrade_UnifySameDomain
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.TopAbs import TopAbs_SHELL, TopAbs_SOLID, TopAbs_FACE, TopAbs_EDGE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS, TopoDS_Shape
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.StlAPI import StlAPI_Writer
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Tool
from OCP.TopoDS import TopoDS_Edge

T0 = time.time()
def log(m): print(f'[{time.time()-T0:6.1f}s] {m}', flush=True)

SEC = '/home/user/Few-few/aletta/scripts/sections.npz'

# --- fit-нати оси на щифтовете (robust cylinder fit върху M8 стеблото) ---
STUDS = {
 'stud1': dict(pt=np.array([65.884,45.298,73.252]), ax=np.array([-0.1037,-0.1183,0.9875]),
   # (radius, Zabs): колар удължен навътре → стебло Ø8 → връх
   prof=[(6.9,178.0),(6.9,191.5),(4.0,195.5),(4.0,201.0),(2.3,204.0),(2.3,208.5),(0.5,210.4)],
   base_z=190.0, collar_r=6.9),
 'stud2': dict(pt=np.array([132.657,45.029,48.131]), ax=np.array([-0.0858,-0.0408,0.9955]),
   prof=[(6.6,138.0),(6.6,147.5),(4.0,151.5),(4.0,157.0),(2.2,160.0),(2.2,164.5),(0.5,166.4)],
   base_z=148.0, collar_r=6.6),
}


def vol(sh):
    g=GProp_GProps(); BRepGProp.VolumeProperties_s(sh,g); return g.Mass()/1000

def count(sh,t):
    ex=TopExp_Explorer(sh,t); n=0
    while ex.More(): n+=1; ex.Next()
    return n

def face_types(sh):
    from collections import Counter
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    c=Counter(); ex=TopExp_Explorer(sh,TopAbs_FACE)
    names={0:'Plane',1:'Cylinder',2:'Cone',3:'Sphere',4:'Torus',5:'BezierSurf',
           6:'BSplineSurf',7:'SurfOfRevol',8:'SurfOfExtr',9:'OffsetSurf',10:'OtherSurf'}
    while ex.More():
        s=BRepAdaptor_Surface(TopoDS.Face_s(ex.Current()))
        c[names.get(int(s.GetType()),str(int(s.GetType())))]+=1; ex.Next()
    return dict(c)


def bspline_surface(O):
    G=np.concatenate([O,O[:,:1,:]],axis=1); nu,nv=G.shape[:2]
    arr=TColgp_Array2OfPnt(1,nu,1,nv)
    for i in range(nu):
        for j in range(nv): arr.SetValue(i+1,j+1,gp_Pnt(*map(float,G[i,j])))
    return GeomAPI_PointsToBSplineSurface(arr,3,8,GeomAbs_C2,0.05).Surface()

def cap_face(loop):
    ha=TColgp_HArray1OfPnt(1,len(loop))
    for i,p in enumerate(loop): ha.SetValue(i+1,gp_Pnt(*map(float,p)))
    it=GeomAPI_Interpolate(ha,True,1e-4); it.Perform()
    e=BRepBuilderAPI_MakeEdge(it.Curve()).Edge()
    return BRepBuilderAPI_MakeFace(BRepBuilderAPI_MakeWire(e).Wire(),True).Face()

def make_body(O, extra_faces=()):
    surf=bspline_surface(O)
    face=BRepBuilderAPI_MakeFace(surf,1e-6).Face()
    sew=BRepBuilderAPI_Sewing(0.2)
    sew.Add(face); sew.Add(cap_face(O[0])); sew.Add(cap_face(O[-1]))
    for f in extra_faces: sew.Add(f)
    sew.Perform()
    ex=TopExp_Explorer(sew.SewedShape(),TopAbs_SHELL); shell=TopoDS.Shell_s(ex.Current())
    solid=BRepBuilderAPI_MakeSolid(shell).Solid()
    sf=ShapeFix_Solid(solid); sf.Perform(); solid=sf.Solid()
    if vol(solid)<0:
        solid.Reverse()
    return solid

def make_stud(S):
    pt=S['pt']; ax=S['ax']/np.linalg.norm(S['ax'])
    # радиален единичен вектор, перпендикулярен на ax
    tmp=np.array([1,0,0]) if abs(ax[0])<0.9 else np.array([0,1,0])
    u=np.cross(ax,tmp); u/=np.linalg.norm(u)
    pts=[]
    for r,zabs in S['prof']:
        t=(zabs-pt[2])/ax[2]
        c=pt+t*ax
        pts.append(c+r*u)
    # затвори по оста: от последната точка към оста (top), после долу по оста (base)
    t_top=(S['prof'][-1][1]-pt[2])/ax[2]; c_top=pt+t_top*ax
    t_bot=(S['prof'][0][1]-pt[2])/ax[2]; c_bot=pt+t_bot*ax
    poly=BRepBuilderAPI_MakePolygon()
    for p in pts: poly.Add(gp_Pnt(*map(float,p)))
    poly.Add(gp_Pnt(*map(float,c_top)))   # към оста горе
    poly.Add(gp_Pnt(*map(float,c_bot)))   # надолу по оста
    poly.Close()
    face=BRepBuilderAPI_MakeFace(poly.Wire(),True).Face()
    axis=gp_Ax1(gp_Pnt(*map(float,pt)), gp_Dir(*map(float,ax)))
    rev=BRepPrimAPI_MakeRevol(face, axis).Shape()
    return normalize_solid(rev)


def normalize_solid(sh):
    """Пресъздава солид с консистентни навън-сочещи нормали (иначе BOP го чете
    като кухина → fuse вади материал вместо да добавя)."""
    ex=TopExp_Explorer(sh,TopAbs_SHELL)
    if ex.More():
        shell=TopoDS.Shell_s(ex.Current())
        sol=BRepBuilderAPI_MakeSolid(shell).Solid()
    else:
        sol=sh
    sf=ShapeFix_Solid(sol); sf.Perform(); sol=sf.Solid()
    if vol(sol)<0:
        sol.Reverse()
    return sol

def fuse(a,b):
    op=BRepAlgoAPI_Fuse(a,b); op.SetFuzzyValue(1e-3); op.Build()
    sh=op.Shape()
    us=ShapeUpgrade_UnifySameDomain(sh,True,True,True); us.Build(); sh=us.Shape()
    return sh

def cut(a,b):
    op=BRepAlgoAPI_Cut(a,b); op.SetFuzzyValue(1e-3); op.Build()
    return op.Shape()

def collar_base_edges(sh, S):
    """Ръбовете около основата на щифта (за fillet): затворени окръжности близо до
    колар-радиуса, на нивото на базата."""
    pt=S['pt']; ax=S['ax']/np.linalg.norm(S['ax']); cr=S['collar_r']
    out=[]
    ex=TopExp_Explorer(sh,TopAbs_EDGE)
    seen=set()
    while ex.More():
        e=TopoDS.Edge_s(ex.Current())
        g=GProp_GProps(); BRepGProp.LinearProperties_s(e,g); c=g.CentreOfMass()
        v=np.array([c.X()-pt[0],c.Y()-pt[1],c.Z()-pt[2]])
        along=v@ax; radial=np.linalg.norm(v-along*ax)
        key=(round(c.X(),2),round(c.Y(),2),round(c.Z(),2))
        if abs(radial-cr)<3.0 and -6<along<8 and key not in seen:
            seen.add(key); out.append(e)
        ex.Next()
    return out


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--cavity',action='store_true')
    ap.add_argument('--no-studs',action='store_true')
    ap.add_argument('--no-fillet',action='store_true')
    ap.add_argument('--out',default='/home/user/Few-few/aletta/cad/Aletta_v4')
    ap.add_argument('--stl',default='/tmp/claude-0/-home-user-Few-few/438edff7-1aa4-5f35-ae09-0931a706d5a3/scratchpad/full.stl')
    a=ap.parse_args()

    d=np.load(SEC); O=d['outer']; inner=d['inner']
    log('зареден sections.npz')
    body=make_body(O)
    log(f'тяло: valid {BRepCheck_Analyzer(body).IsValid()} vol {vol(body):.2f}')

    if a.cavity and len(inner)>0:
        cavsol=make_body(inner)   # солид от вътрешните примки
        log(f'кухина-солид: valid {BRepCheck_Analyzer(cavsol).IsValid()} vol {vol(cavsol):.2f}')
        body=cut(body,cavsol)
        log(f'след cut кухина: valid {BRepCheck_Analyzer(body).IsValid()} vol {vol(body):.2f} solids {count(body,TopAbs_SOLID)}')

    shape=body
    if not a.no_studs:
        for nm,S in STUDS.items():
            st=make_stud(S)
            log(f'{nm}: valid {BRepCheck_Analyzer(st).IsValid()} vol {vol(st):.2f}')
            shape=fuse(shape,st)
            log(f'fuse {nm}: valid {BRepCheck_Analyzer(shape).IsValid()} vol {vol(shape):.2f} solids {count(shape,TopAbs_SOLID)}')

        if not a.no_fillet:
            for nm,S in STUDS.items():
                edges=collar_base_edges(shape,S)
                if not edges:
                    log(f'{nm}: няма base edge за fillet'); continue
                done=False
                for rr in (2.0,1.5,1.0,0.6):
                    try:
                        mk=BRepFilletAPI_MakeFillet(shape)
                        for e in edges: mk.Add(rr,e)
                        mk.Build()
                        if mk.IsDone():
                            F=mk.Shape()
                            if BRepCheck_Analyzer(F).IsValid() and count(F,TopAbs_SOLID)==1:
                                shape=F; done=True
                                log(f'{nm}: fillet r={rr} на {len(edges)} ръба OK vol {vol(shape):.2f}')
                                break
                    except Exception as e:
                        log(f'{nm}: fillet r={rr} FAIL {str(e)[:40]}')
                if not done:
                    log(f'{nm}: fillet неуспешен, чиста връзка')

    # финален ремонт/валидация
    sf=ShapeFix_Shape(shape); sf.Perform(); shape=sf.Shape()
    an=BRepCheck_Analyzer(shape)
    log(f'ФИНАЛ: valid {an.IsValid()} solids {count(shape,TopAbs_SOLID)} '
        f'faces {count(shape,TopAbs_FACE)} vol {vol(shape):.2f}')
    log(f'типове лица: {face_types(shape)}')
    bb=Bnd_Box(); BRepBndLib.Add_s(shape,bb)
    xmin,ymin,zmin,xmax,ymax,zmax=bb.Get()
    log(f'bbox {xmax-xmin:.1f} x {ymax-ymin:.1f} x {zmax-zmin:.1f}')

    # експорт
    Interface_Static.SetCVal_s('write.step.schema','AP214')
    sw=STEPControl_Writer(); sw.Transfer(shape,STEPControl_AsIs); sw.Write(a.out+'.step')
    from OCP.BRepTools import BRepTools
    BRepTools.Write_s(shape,a.out+'.brep')
    log(f'STEP+BREP → {a.out}')
    BRepMesh_IncrementalMesh(shape,0.04,False,0.25,True)
    StlAPI_Writer().Write(shape,a.stl)
    log(f'STL → {a.stl}')

if __name__=='__main__':
    main()
