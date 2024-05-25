# Use an official Python runtime as a parent image
FROM node

# Set the working directory to /app
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install any needed packages specified in requirements.txt
RUN npm install --verbose --production

# Make port 80 available to the world outside this container
# EXPOSE 3030

# Define environment variable
# ENV NAME World

# Run app.py when the container launches
CMD ["node", "server/dist/benchmarks/redis.js"]