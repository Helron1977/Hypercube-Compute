import os

def split_obj(input_path, output_path, split_x):
    with open(input_path, 'r') as f:
        lines = f.readlines()

    vertices = []
    # Index starts at 1 in OBJ
    v_coords = [None] 
    
    for line in lines:
        if line.startswith('v '):
            parts = line.split()
            x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
            v_coords.append((x, y, z))

    body_faces = []
    tail_faces = []

    for line in lines:
        if line.startswith('f '):
            parts = line.split()[1:]
            # Get vertex indices (handle v/vt/vn)
            v_indices = [int(p.split('/')[0]) for p in parts]
            
            # Decide group based on average X
            avg_x = sum(v_coords[i][0] for i in v_indices) / len(v_indices)
            if avg_x < split_x:
                tail_faces.append(line)
            else:
                body_faces.append(line)

    with open(output_path, 'w') as f:
        # Write all vertices
        for line in lines:
            if line.startswith('v ') or line.startswith('vn') or line.startswith('vt') or line.startswith('mtllib'):
                f.write(line)
        
        f.write("\ng body\n")
        for face in body_faces:
            f.write(face)
            
        f.write("\ng tail\n")
        for face in tail_faces:
            f.write(face)

input_file = r'c:\Users\rolan\OneDrive\Desktop\hypercube\showcase\life\nebula\assets\shark.obj'
output_file = r'c:\Users\rolan\OneDrive\Desktop\hypercube\showcase\life\nebula\assets\shark_split.obj'
split_obj(input_file, output_file, -92.0)
print(f"Split completed: {output_file}")
