"""Continuous eroded stone, irregular shore and original ground detail (Y-up)."""
import math, random, json, os
R = random.Random(3812)
TAU = math.tau

def build_terrain(add, rod, ell, polyline):
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    with open(os.path.join(root, 'src/landscape-profile.json')) as f:
        profile = json.load(f)
    def shore(t):
        r = profile['base'] + sum(a*math.sin(n*t+p) for n,a,p in profile['harmonics'])
        return 18*r*math.cos(t), 9*r*math.sin(t)
    def outline(t):
        r=1+.047*math.sin(7*t+.3)+.03*math.cos(11*t)+.022*math.sin(19*t)
        for x,z in [(-12,11),(0,13),(11,11),(21,3)]:
            angle=math.atan2(z/14,x/24);d=abs(math.atan2(math.sin(t-angle),math.cos(t-angle)))
            if d<.18:r=min(r,math.hypot(x/24,z/14)-.035+.20*(d/.11)**4)
        return r
    def outlet(x,z):
        return any(abs(x-a)<w and abs(z-b)<2.0 for a,b,w in [(-12,11,1.7),(0,13,2.1),(11,11,1.9),(21,3,1.5)])
    def stone(name, center, size, seed, material='RockLight', moss=False):
        # Angular, bevelled polyhedron with correlated fracture planes: no sphere primitives.
        rng=random.Random(seed); seg=9; phase=rng.uniform(0,TAU)
        radii=[rng.uniform(.82,1.16) for _ in range(seg)]
        levels=[(-.85,.53),(-.57,.96),(.15,1.0),(.67,.79),(.86,.46)]
        vertices=[]
        for j,(y,rr) in enumerate(levels):
            for k in range(seg):
                t=k*TAU/seg+phase; r=radii[k]*rr
                xx=(math.cos(t)*r+.15*y)*size[0]; zz=(math.sin(t)*r-.12*y)*size[2]
                vertices.append((center[0]+xx,center[1]+size[1]*(y+.085*math.sin(k*2.0+seed)),center[2]+zz))
        faces=[]
        for j in range(4):
            for k in range(seg):faces.append((j*seg+k,(j+1)*seg+k,(j+1)*seg+(k+1)%seg,j*seg+(k+1)%seg))
        faces.append(tuple(range(5*seg-1,4*seg-1,-1)))
        faces.append(tuple(range(seg)))
        add(name,material,vertices,faces)
        if moss:
            # A thin, broken cap hugs the same exposed stone surface.
            cap=[(p[0],p[1]+.014,p[2]) for p in vertices]
            top=[tuple(range(5*seg-1,4*seg-1,-1))]
            for k in range(seg):
                if rng.random()>.25:top.append((3*seg+k,4*seg+k,4*seg+(k+1)%seg,3*seg+(k+1)%seg))
            add(name+'Moss','Moss',cap,top)
    n=256
    # Correlated broad ribs and deep fissures carry through all strata.
    rings=[(.98,.12),(1.,-.65),(.99,-1.5),(.95,-2.3),(.96,-3.1),(.90,-4.3),(.88,-5.3),(.81,-6.8),(.80,-7.5),(.70,-9.1),(.62,-10.2),(.47,-11.9),(.28,-13.2),(.05,-13.9)]
    vertices=[]
    for j,(rr,y) in enumerate(rings):
        for i in range(n):
            t=i*TAU/n; ridge=.035*math.cos(t*43+.4)+.018*math.sin(t*71)
            r=outline(t)*rr*(1+ridge*(.4 if j==0 else 1))
            yy=y+(.10 if j==0 else .24)*math.sin(t*9+j*.4)+.10*math.cos(t*23)
            vertices.append((24*r*math.cos(t)+.18*math.sin(j*.5), yy,14*r*math.sin(t)))
    faces=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(rings)-1) for i in range(n)]
    faces.append(tuple(range((len(rings)-1)*n,len(rings)*n)))
    add('IslandCliff','Basalt',vertices,faces)
    # Lake shelf blends the common water contour into the outer rim in six bands.
    vertices=[]
    for j in range(7):
        a=j/6
        for i in range(n):
            t=i*TAU/n; x,z=shore(t); ox,oz=24*.98*outline(t)*math.cos(t),14*.98*outline(t)*math.sin(t)
            h=-.34*(1-a)+.12*a + math.sin(a*math.pi)*(.22+.12*math.sin(t*17))
            if j==0:h=-.38
            if outlet(x*(1-a)+ox*a,z*(1-a)+oz*a):h=min(h,.07)
            vertices.append((x*(1-a)+ox*a,h,z*(1-a)+oz*a))
    for j in range(6):
        faces=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for i in range(n)]
        add('IslandShore','WetStone' if j==0 else 'Earth' if j==1 else 'Grass',vertices,faces)
    # Interlocked fracture blocks, deliberately varied scale and position.
    for i in range(64):
        t=i*TAU/64+R.uniform(-.018,.018); x=23.1*outline(t)*math.cos(t);z=13.4*outline(t)*math.sin(t)
        if outlet(x,z):continue
        h=R.uniform(1.5,3.7)
        stone('CliffFracture',(x,-h*.62,z),(R.uniform(.65,1.3),h,R.uniform(.55,1.1)),1000+i,'RockLight' if i%3 else 'RockDark',i%3!=0)
        if i%2==0:
            stone('CliffLedge',(x*.9,-h*1.6,z*.9),(R.uniform(.7,1.3),h*.65,.8),1100+i,'Basalt')
    # Partly submerged shore stone clusters, with sandy gaps between groups.
    for i in range(112):
        t=R.uniform(0,TAU)
        if math.sin(t*7+.4)<-.48:continue
        x,z=shore(t); scale=R.uniform(1.0,1.14);x*=scale;z*=scale
        if outlet(x,z):continue
        s=R.uniform(.25,.73)
        stone('ShoreBoulders',(x,.12+s*.18,z),(s*1.4,s*.85,s),2000+i,'WetStone' if i%3==0 else 'RockLight',i%3==1)
        for k in range(3):
            sx=x+R.uniform(-.8,.8);sz=z+R.uniform(-.55,.55)
            stone('ShorePebbles',(sx,-.03,sz),(.12,.09,.15),3000+i*4+k,'WetStone')
    # Palace escarpment: three joined ridges support the unchanged terrace anchors.
    def ridge(cx,cz,sx,sz,height,seed):
        segments=100;v=[]
        levels=[(1.12,.06),(1.10,.13),(.99,.32),(.92,.42),(.80,.66),(.74,.73),(.61,.96),(.60,1.0)]
        for j,(rr,yy) in enumerate(levels):
            for i in range(segments):
                t=i*TAU/segments
                r=rr*(1+.055*math.sin(t*7+seed)+.035*math.cos(t*13+seed)+.018*math.sin(t*31))
                y=height*yy + (.0 if j==7 else (.24*math.sin(t*3+seed)+.16*math.sin(t*7+seed)+.05*math.sin(t*19)))
                v.append((cx+sx*r*math.cos(t)+.12*math.sin(j),y,cz+sz*r*math.sin(t)))
        for j in range(len(levels)-1):
            f=[(j*segments+i,(j+1)*segments+i,(j+1)*segments+(i+1)%segments,j*segments+(i+1)%segments) for i in range(segments)]
            add('PalaceMountain','Basalt',v,f)
        add('PalaceMountain','Moss',v,[tuple(range(8*segments-1,7*segments-1,-1))])
        for k in range(38):
            t=k*2.399963+seed; yy=R.uniform(.2,.8); rr=1.12-.51*yy
            x=cx+sx*rr*math.cos(t);z=cz+sz*rr*math.sin(t)
            # Front staircase remains open.
            if abs(x-7)<1.7 and z>-8:continue
            stone('MountainCrags',(x,height*yy,z),(R.uniform(.55,1.15),R.uniform(.9,1.7),R.uniform(.65,1.15)),seed*100+k,'RockLight' if k%3 else 'RockDark',k%2==0)
    ridge(7,-9,7.6,4.4,6.78,13)
    ridge(.5,-10.5,3.9,2.8,3.08,17)
    ridge(13,-9.7,3.8,2.75,4.17,21)
    # Root ledges meet the pre-existing high tree placements rather than leaving roots suspended.
    for i,(x,y,z) in enumerate([(17,1.3,-7),(11,6.2,-12),(2,4.2,-12),(1.4,2.5,-7.8),(3.1,4,-6.5),(10.9,3.8,-6.6),(13,2.6,-8),(5,5.8,-11.7),(0,1.7,-11.4)]):
        stone('RootLedges',(x,y-.45,z),(.75,.6,.7),4000+i,'RockLight',True)
    # Fine tufted ground vegetation is real folded geometry, batched by material.
    for i in range(500):
        t=R.uniform(0,TAU);a=R.uniform(.2,.95);x,z=shore(t);ox,oz=23.5*outline(t)*math.cos(t),13.6*outline(t)*math.sin(t)
        x=x*(1-a)+ox*a;z=z*(1-a)+oz*a
        if outlet(x,z) or (abs(x+18)<3.7 and abs(z-3)<3) or (abs(x-13)<3 and abs(z-5.8)<2.2):continue
        for k in range(4):
            ang=R.uniform(0,TAU);h=R.uniform(.13,.4);w=.022;dx,dz=math.cos(ang),math.sin(ang);y=.13
            v=[(x-dz*w,y,z+dx*w),(x+dz*w,y,z-dx*w),(x+dx*.07,y+h*.55,z+dz*.07),(x+dx*.17,y+h,z+dz*.17)]
            add('ShoreGrasses','Grass' if i%3 else 'LeafLight',v,[(0,1,2),(0,2,3)])
