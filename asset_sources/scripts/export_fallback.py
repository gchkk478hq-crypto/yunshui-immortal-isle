"""Pure Python GLB export of same source buffers when native Blender cannot start."""
import os,math,json,struct,re
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
class Vector:
 def __init__(self,v):self.v=list(v)
 def __iter__(self):return iter(self.v)
 def __getitem__(self,i):return self.v[i]
 def __add__(self,o):return Vector([a+b for a,b in zip(self,o)])
 def __sub__(self,o):return Vector([a-b for a,b in zip(self,o)])
 def __mul__(self,s):return Vector([a*s for a in self])
 __rmul__=__mul__
 def __truediv__(self,s):return self*(1/s)
 @property
 def length(self):return math.sqrt(sum(a*a for a in self))
 def normalize(self):self.v=[a/(self.length or 1) for a in self];return self
 def normalized(self):return Vector(self).normalize()
 def cross(self,o):a,b,c=self;x,y,z=o;return Vector((b*z-c*y,c*x-a*z,a*y-b*x))
source=open(os.path.join(ROOT,'asset_sources/scripts/build_scene.py')).read()
source=source[source.index('R=random.Random'):source.index('# Build one object')]
source=source.replace("bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)","")
start=source.index('def mat(');end=source.index("mat('Basalt'")
source=source[:start]+'''def mat(n,c,metal=0,rough=.65,emission=0):
 M[n]={'name':n,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[*c,1],'metallicFactor':metal,'roughnessFactor':rough}}
 if emission:M[n]['emissiveFactor']=[min(1,emission*x) for x in c]
'''+source[end:]
import random
exec(source)
data=bytearray();views=[];acc=[];meshes=[];nodes=[]
def buffer(vals,fmt,typ,comps,mins=None,maxs=None):
 while len(data)%4:data.append(0)
 offset=len(data);data.extend(struct.pack('<'+fmt*len(vals),*vals));vi=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data)-offset});a={'bufferView':vi,'componentType':typ,'count':len(vals)//comps,'type':{1:'SCALAR',3:'VEC3'}[comps]}
 if mins:a['min']=mins;a['max']=maxs
 acc.append(a);return len(acc)-1
tri=0;vertices=0
for (name,ma),(vs,fs) in B.items():
 # Already in Blender coords -> export glTF Y-up.
 vs=[(x,z,-y) for x,y,z in vs];indices=[];normals=[[0.,0.,0.] for _ in vs]
 for face in fs:
  for j in range(1,len(face)-1):
   ia,ib,ic=face[0],face[j],face[j+1];indices.extend([ia,ib,ic]);a,b,c=Vector(vs[ia]),Vector(vs[ib]),Vector(vs[ic]);n=(b-a).cross(c-a)
   for ix in [ia,ib,ic]:normals[ix]=[normals[ix][k]+n[k] for k in range(3)]
 normals=[Vector(n).normalized() for n in normals]
 pos=buffer([q for v in vs for q in v],'f',5126,3,[min(v[k] for v in vs) for k in range(3)],[max(v[k] for v in vs) for k in range(3)])
 nor=buffer([q for v in normals for q in v],'f',5126,3);ind=buffer(indices,'I',5125,1)
 meshes.append({'name':name+'_'+ma,'primitives':[{'attributes':{'POSITION':pos,'NORMAL':nor},'indices':ind,'material':list(M).index(ma)}]});node={'name':name+'_'+ma,'mesh':len(meshes)-1}
 event='flora.magnolia' if name.startswith('Magnolia') else 'flora.leaves' if name.startswith(('Pine','Bamboo')) else 'pavilion.lantern' if name.startswith('Lantern') else 'camera.bridge' if name.startswith('CentralBridge') else 'camera.palace' if name.startswith('Palace') else ''
 if event:node['extras']={'event':event}
 nodes.append(node);tri+=len(indices)//3;vertices+=len(vs)
gltf={'asset':{'version':'2.0','generator':'Yunshui deterministic original geometry fallback'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'materials':list(M.values()),'buffers':[{'byteLength':len(data)}],'bufferViews':views,'accessors':acc}
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4);data+=b'\x00'*((-len(data))%4)
with open(os.path.join(ROOT,'public/assets/models/island.glb'),'wb') as f:f.write(struct.pack('<III',0x46546c67,2,28+len(j)+len(data)));f.write(struct.pack('<II',len(j),0x4E4F534A));f.write(j);f.write(struct.pack('<II',len(data),0x004E4942));f.write(data)
stats={'objects':len(nodes),'materials':len(M),'triangles':tri,'vertices':vertices,'seed':812,'source':'Original deterministic geometry, exported directly; Blender export pending','bytes':28+len(j)+len(data)}
json.dump(stats,open(os.path.join(ROOT,'asset_sources/stats.json'),'w'),indent=2);print(stats)
