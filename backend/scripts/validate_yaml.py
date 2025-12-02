import sys
import yaml
import json
from pathlib import Path
from jsonschema import validate, exceptions

# Lokasi skema diasumsikan berada di direktori yang sama dengan script ini
SCHEMA_DIR = Path(__file__).parent
CHALLENGE_SCHEMA_PATH = SCHEMA_DIR / 'challenge_schema.json'
QUIZ_SCHEMA_PATH = SCHEMA_DIR / 'quiz_schema.json'

def load_schema(schema_path: Path):
    """Memuat skema JSON dari file."""
    try:
        with open(schema_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: Skema tidak ditemukan di {schema_path}. Pastikan file skema JSON ada.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error saat memuat skema JSON dari {schema_path}: {e}")
        sys.exit(1)

def validate_yaml_file(yaml_file_path: Path):
    """Memuat dan memvalidasi file YAML terhadap skema yang sesuai."""
    if not yaml_file_path.exists():
        print(f"❌ Error: File YAML tidak ditemukan di {yaml_file_path}")
        sys.exit(1)

    try:
        with open(yaml_file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"❌ Error: Gagal mem-parsing file YAML '{yaml_file_path.name}'. Sintaks YAML tidak valid.")
        print(f"Detail: {e}")
        sys.exit(1)

    # 1. Tentukan Tipe dan Skema
    yaml_type = data.get('type')
    
    if yaml_type == 'challenge':
        schema = load_schema(CHALLENGE_SCHEMA_PATH)
        schema_name = "Challenge"
    elif yaml_type == 'quiz':
        schema = load_schema(QUIZ_SCHEMA_PATH)
        schema_name = "Quiz"
    else:
        print(f"❌ Error: File '{yaml_file_path.name}' tidak memiliki field 'type' atau nilainya bukan 'challenge' atau 'quiz'.")
        sys.exit(1)

    print(f"🔍 Memvalidasi file '{yaml_file_path.name}' sebagai tipe '{schema_name}'...")

    # 2. Jalankan Validasi Skema
    try:
        validate(instance=data, schema=schema)
        
        # 3. Validasi Tambahan (Cross-field logic - Challenge)
        if yaml_type == 'challenge':
            validate_challenge_nodes(data)

        print(f"\n✅ VALIDASI BERHASIL untuk '{yaml_file_path.name}'!")
        print(f"   Struktur data YAML Anda sesuai dengan template {schema_name}.")
        sys.exit(0)

    except exceptions.ValidationError as e:
        print(f"\n❌ VALIDASI GAGAL untuk '{yaml_file_path.name}'!")
        print("-" * 30)
        print("DETAIL ERROR:")
        # Menampilkan path yang jelas ke properti yang bermasalah
        path_segments = [str(p) for p in e.absolute_path]
        error_path = ".".join(path_segments) if path_segments else "[root]"
        
        print(f"Path Bermasalah: {error_path}")
        print(f"Pesan Error: {e.message}")
        print("-" * 30)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ VALIDASI GAGAL untuk '{yaml_file_path.name}'!")
        print(f"Error Internal/Cross-field: {e}")
        sys.exit(1)


def validate_challenge_nodes(data):
    """Memeriksa konsistensi ID node dan NEXT pointer untuk tantangan."""
    node_ids = {node['id'] for node in data['nodes']}
    
    # Kumpulkan semua target 'next' yang ada di opsi dan node
    target_ids = set()
    for node in data['nodes']:
        # Ambil 'next' dari node (untuk message node)
        if 'next' in node:
            target_ids.add(node['next'])
        
        # Ambil 'next' dari opsi (untuk question node)
        if node.get('type') == 'question' and 'options' in node:
            for option in node['options']:
                if 'next' in option:
                    target_ids.add(option['next'])

    # Pastikan semua target 'next' menunjuk ke ID node yang valid
    for target_id in target_ids:
        if target_id not in node_ids:
            raise Exception(f"Referensi node tidak valid: 'next' menunjuk ke ID '{target_id}', yang tidak ada di daftar node ID.")

    # Pastikan ada node 'start'
    if 'start' not in node_ids:
        raise Exception("Node 'start' (ID: 'start') wajib ada sebagai titik masuk.")

    # Pastikan tidak ada loop tertutup (pemeriksaan sederhana: node 'end' harus ada)
    end_nodes = [node for node in data['nodes'] if node.get('type') == 'end']
    if not end_nodes:
        raise Exception("Setidaknya satu node bertipe 'end' wajib ada.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_yaml.py <path/to/your-file.yaml>")
        sys.exit(1)
        
    yaml_path = Path(sys.argv[1])
    validate_yaml_file(yaml_path)