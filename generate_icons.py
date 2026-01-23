from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    # Create a new image with a white background
    image = Image.new('RGB', (size, size), 'white')
    draw = ImageDraw.Draw(image)
    
    # Draw a blue circle
    circle_margin = size // 10
    draw.ellipse([circle_margin, circle_margin, size - circle_margin, size - circle_margin], fill='#2196F3')
    
    # Add mosque silhouette (simplified)
    dome_height = size // 3
    base_width = size // 2
    base_x = (size - base_width) // 2
    base_y = size - circle_margin - dome_height
    
    # Draw simplified mosque shape in white
    points = [
        (base_x, base_y + dome_height),  # bottom left
        (base_x, base_y),                # top left
        (base_x + base_width//2, base_y - dome_height//2),  # dome top
        (base_x + base_width, base_y),   # top right
        (base_x + base_width, base_y + dome_height)  # bottom right
    ]
    draw.polygon(points, fill='white')
    
    # Save the image
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    image.save(output_path, 'PNG')

def main():
    sizes = [72, 96, 128, 144, 152, 192, 384, 512]
    base_path = 'static/icons'
    
    for size in sizes:
        output_path = f'{base_path}/icon-{size}x{size}.png'
        create_icon(size, output_path)
        print(f'Created icon: {output_path}')

if __name__ == '__main__':
    main()
