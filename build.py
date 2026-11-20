"""Menggabungkan src/ menjadi satu file index.html yang bisa dibuka langsung di browser."""
import os
R = os.path.dirname(os.path.abspath(__file__))
s = open(f'{R}/src/shell.html', encoding='utf-8').read()
core = open(f'{R}/src/core.js', encoding='utf-8').read().replace("if (typeof module !== 'undefined') module.exports = CORE;", "")
app = open(f'{R}/src/app.js', encoding='utf-8').read()
open(f'{R}/index.html', 'w', encoding='utf-8').write(s.replace('/*CORE*/', core).replace('/*APP*/', app))
print('index.html dibuat')
