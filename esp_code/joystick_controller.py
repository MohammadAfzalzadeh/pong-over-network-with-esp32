from machine import Pin, time_pulse_us, SoftI2C, ADC
import time
import ssd1306
from collections import deque
import network
import socket
import json


# Define pins
TRIG_PIN = 5
ECHO_PIN = 18
vrx = ADC(Pin(36)) # A0
vrx.atten(ADC.ATTN_11DB) # 0–3.3V

distance_history = [50] * 5 # Start with 5 default values

# Initialize I2C and OLED (adjust pins if needed)
i2c = SoftI2C(scl=Pin(16), sda=Pin(17))
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

# Constants
SCREEN_WIDTH = 128
SCREEN_HEIGHT = 64
PADDLE_WIDTH = 2
PADDLE_HEIGHT = 16
BALL_SIZE = 2

# Initial positions
paddle_a_y = 24
paddle_b_y = 24
ball_x = 64
ball_y = 32
dx = 2.0
dy = 2.0

location = 32

# Scores
score_a = 0
score_b = 0

# Initialize pins
trig = Pin(TRIG_PIN, Pin.OUT)
echo = Pin(ECHO_PIN, Pin.IN)

# Replace with your Wi-Fi credentials
SSID = 'SSID'
PASSWORD = 'PASSWORD'

# Connect to Wi-Fi
wifi = network.WLAN(network.STA_IF)
wifi.active(True)
wifi.connect(SSID, PASSWORD)

print("Connecting to Wi-Fi")

while not wifi.isconnected():
    print('.', end='')
    time.sleep(1)

print("Connected:", wifi.ifconfig())

# Replace with the IP and port of your server
SERVER_IP = 'SERVER IP'
SERVER_PORT = 3000

client_socket = socket.socket()

try:
    client_socket.connect((SERVER_IP, SERVER_PORT))
    print("Connected to server.")
except Exception as e:
    print("Connection failed:", e)
    client_socket = None
    

def draw(paddle_a_y, paddle_b_y, ball_x, ball_y, score_a, score_b):
    oled.fill(0) # Clear screen

    # Draw paddles
    oled.fill_rect(2, paddle_a_y, PADDLE_WIDTH, PADDLE_HEIGHT, 1)
    oled.fill_rect(SCREEN_WIDTH - 4, paddle_b_y, PADDLE_WIDTH, PADDLE_HEIGHT, 1)

    # Draw ball
    oled.fill_rect(int(ball_x), int(ball_y), BALL_SIZE, BALL_SIZE, 1)

        # Draw score
    oled.text(str(score_a), 48, 0)
    oled.text(str(score_b), 78, 0)
    
    oled.show()
    
def reset_ball():
    global ball_x, ball_y, dx, dy
    
    ball_x = SCREEN_WIDTH // 2
    ball_y = SCREEN_HEIGHT // 2
    dy = -2.0 if dy > 0 else 2.0
    dx = 2.0 if dy > 0 else -2.0


def measure_distance():
    # Ensure trigger is low
    trig.value(0)
    time.sleep_us(2)

    # Send 10us pulse
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)

    # Measure echo pulse duration
    duration = time_pulse_us(echo, 1, 30000) # timeout in microseconds

    if duration < 0:
        return 0

    # Speed of sound = 343 m/s = 0.0343 cm/us
    distance_cm = (duration * 0.0343) / 2
    return distance_cm

def increase_speed():
    global dx, dy
    if dx > 0:
        dx += 0.2
    else:
        dx -= 0.2
    
    if dy > 0:
        dy += 0.2
    else:
        dy -= 0.2
        
    print("dx = " + str(dx))
    print("dy = " + str(dy))
    
def clamp(val, min_val, max_val):
    return max(min_val, min(val, max_val))


if client_socket:
    msg = "{\"event\": \"player:join\", \"data\": { \"name\" : \"esp32-playerTwo\" } }"
    
    client_socket.send(msg.encode())
    print("wait for start game.")
    data = client_socket.recv(1024)
    print("Received:", data.decode())
    print(json.loads(data.decode())["status"])
    while True:
        try:
            data = client_socket.recv(1024)
            board = json.loads(data.decode())
            draw(board["rightPaddle"] , board["leftPaddle"] , board["ball"]["x"] , board["ball"]["y"] , board["rightScore"] , board["leftScore"])
            if board["rightScore"] == 10 :
                oled.fill(0)
                oled.text("You Lost.:/", 48, 20)
                oled.show()
                client_socket.close()
                client_socket = None
            elif board["leftScore"] == 10:
                oled.fill(0)
                oled.text("You Won. :)", 48, 20)
                oled.show()
                client_socket.close()
                client_socket = None
            else:
                x = vrx.read() # 0 - 4095
                center = 2048
                
                # Calculate distance from center, signed
                delta = x - center

                # Normalize delta to -1 to 1 range
                norm_delta = delta / center # approx between -1 and 1

                # Calculate speed: use abs(norm_delta) as speed factor (0 to 1)
                speed = abs(norm_delta)

                # Define max speed change per loop
                max_speed = 3 # max steps per loop, adjust as you want

                # Calculate how much location changes this cycle
                change = norm_delta * max_speed * speed # speed scales with distance from center

                # Apply change, rounding to int for location steps
                location += int(change)

                data_sent = int(clamp(location , 0 , 48))
                msg = "{ \"event\": \"game:paddle\", \"data\": { \"y\":" + str(data_sent) + " , \"playerName\": \"esp32-playerTwo\" } }"
                print(msg)
                client_socket.send(msg.encode())

        except Exception as e:
            print("Send failed:", e)


