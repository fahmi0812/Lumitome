import cairosvg, io
from PIL import Image
LEAF="M0,0 C -8,-18 -50,-40 -40,-78 C -32,-102 -6,-100 0,-80 C 6,-100 32,-102 40,-78 C 50,-40 8,-18 0,0 Z"
DEFS='''<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF4C8"/><stop offset=".45" stop-color="#E8C266"/><stop offset="1" stop-color="#A97A1E"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8DC"/><stop offset="1" stop-color="#C9962E"/></linearGradient>
<linearGradient id="cover" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1E3C2"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#FFF6D5" stop-opacity=".95"/><stop offset="1" stop-color="#FFF6D5" stop-opacity="0"/></radialGradient>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFDF7"/><stop offset=".6" stop-color="#F8EED8"/><stop offset="1" stop-color="#EEDDB6"/></linearGradient>
</defs>'''
def clover(s=1):
    leaves="".join(f'<path d="{LEAF}" transform="rotate({a}) scale(0.72,1)" fill="url(#gl)" stroke="#9C6F17" stroke-width="2.2"/><path d="M0,-6 L0,-70" transform="rotate({a})" stroke="#B8892A" stroke-width="1.6" opacity=".7"/>' for a in range(0,360,60))
    return f'<g transform="scale({s})">{leaves}<circle r="11" fill="url(#g)" stroke="#9C6F17" stroke-width="2"/><circle r="4" fill="#FFF8DC"/></g>'
def rays(n=24,r=480):
    import math
    out=""
    for i in range(n):
        a=math.radians(i*360/n); b=math.radians(i*360/n+4)
        out+=f'<path d="M0,0 L{r*math.cos(a):.1f},{r*math.sin(a):.1f} L{r*math.cos(b):.1f},{r*math.sin(b):.1f} Z" fill="#F3D27A" opacity=".10"/>'
    return out
def book():  # centered at 0,0 ~ 560x700
    return f'''<g>
<rect x="-290" y="-355" width="580" height="710" rx="26" fill="#C9962E"/>
<rect x="-280" y="-345" width="560" height="690" rx="22" fill="url(#cover)" stroke="url(#g)" stroke-width="10"/>
<rect x="-245" y="-310" width="490" height="620" rx="14" fill="none" stroke="#D4AF5A" stroke-width="3"/>
<rect x="-232" y="-297" width="464" height="594" rx="10" fill="none" stroke="#E6C77E" stroke-width="1.5" stroke-dasharray="2 6"/>
{"".join(f'<g transform="translate({x},{y}) rotate({r})"><path d="M0,0 Q40,6 60,40 Q30,22 0,30 Z" fill="url(#g)"/><circle cx="8" cy="8" r="6" fill="#E8C266"/></g>' for x,y,r in [(-245,-310,0),(245,-310,90),(245,310,180),(-245,310,270)])}
<circle r="190" fill="none" stroke="#D4AF5A" stroke-width="3"/>
<circle r="175" fill="none" stroke="#E6C77E" stroke-width="1.5"/>
</g>'''
def logo_svg(bg=False):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-512 -512 1024 1024" width="1024" height="1024">{DEFS}
{'<rect x="-512" y="-512" width="1024" height="1024" fill="url(#bg)"/>' if bg else ''}
<circle r="500" fill="url(#glow)"/>{rays()}
<g transform="scale(1.25)">{book()}<circle r="160" fill="url(#glow)"/>{clover(1.9)}</g></svg>'''
def icon_svg():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-256 -256 512 512" width="512" height="512">{DEFS}
<rect x="-246" y="-246" width="492" height="492" rx="96" fill="url(#cover)" stroke="url(#g)" stroke-width="12"/>
<rect x="-220" y="-220" width="440" height="440" rx="76" fill="none" stroke="#D4AF5A" stroke-width="3"/>
<circle r="200" fill="url(#glow)"/>{clover(2.25)}</svg>'''
def banner_svg(W,H,tag=True):
    cx=W*0.24; s=H/900
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{DEFS}
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<g transform="translate({cx},{H/2})"><circle r="{560*s}" fill="url(#glow)"/><g transform="scale({s*1.6})">{rays(32,500)}</g>
<g transform="scale({s*0.95})">{book()}<circle r="160" fill="url(#glow)"/>{clover(1.9)}</g></g>
<rect x="{W*0.46}" y="{H*0.5-2*s}" width="{W*0.42}" height="{3*s}" fill="url(#g)"/>
<text x="{W*0.46}" y="{H*0.46}" font-family="Cormorant Garamond, serif" font-weight="700" font-size="{170*s}" fill="#9C6F17" letter-spacing="{6*s}">Lumitome</text>
<text x="{W*0.462}" y="{H*0.58}" font-family="Noto Serif, serif" font-style="italic" font-size="{44*s}" fill="#7A5A1A">The book of light for your AI agent</text>
{f'<text x="{W*0.462}" y="{H*0.66}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="{22*s}" fill="#8C7346" letter-spacing="{2*s}">SAFE BY DEFAULT · PINNED ENGINE · SKILL ROUTING</text>' if tag else ''}
</svg>'''
def png(svg,path,w,h):
    cairosvg.svg2png(bytestring=svg.encode(),write_to=path,output_width=w,output_height=h)
open("logo.svg","w").write(logo_svg()); png(logo_svg(),"logo-1024.png",1024,1024)
ic=icon_svg(); open("icon.svg","w").write(ic)
for n in (512,256,192): png(ic,f"icon-{n}.png",n,n)
Image.open("icon-512.png").save("favicon.ico",sizes=[(32,32),(48,48)])
b=banner_svg(1600,900); open("banner.svg","w").write(b); png(b,"banner-1600x900.png",1600,900)
png(banner_svg(1280,640),"social-preview-1280x640.png",1280,640)
