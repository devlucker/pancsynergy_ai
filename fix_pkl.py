import pickle

with open('saved_models/uspto_reaction_model.pkl', 'rb') as f:
    data = pickle.load(f)

for cid, cond in data.get('class_conditions', {}).items():
    for k, v in list(cond.items()):
        if isinstance(v, str):
            clean_v = v.encode('utf-8', 'replace').decode('utf-8')
            clean_v = clean_v.replace('\ufffdC', '°C').replace('\ufffd', '·')
            cond[k] = clean_v

if 2 in data.get('class_conditions', {}):
    data['class_conditions'][2]['solvent'] = 'N,N-Dimethylformamide (DMF) or Dichloromethane (DCM)'
    data['class_conditions'][2]['temperature'] = '0 °C to 25 °C (ambient)'
    data['class_conditions'][2]['catalyst_reagents'] = 'HATU or HOBt / EDC·HCl with DIPEA (Hunig\'s base)'
    data['class_conditions'][2]['estimated_time'] = '2 - 6 hours'
    data['class_conditions'][2]['expected_yield'] = '80 - 95%'

with open('saved_models/uspto_reaction_model.pkl', 'wb') as f:
    pickle.dump(data, f)

print('Updated saved_models/uspto_reaction_model.pkl successfully!')
print(data['class_conditions'][2])
