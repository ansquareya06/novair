-- NOVAIR relational schema (MySQL 8, InnoDB, utf8mb4)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS inventory_log, activity_log, assignments, routes, alerts, predictions, historical_incidents,
  sensor_readings, incidents, inventory, resources, responders, shelters, hospitals, districts, users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(80),
  password_hash VARCHAR(200) NOT NULL,
  role VARCHAR(10) NOT NULL,
  CHECK (role IN ('Admin','Staff','Citizen'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE districts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  population_lakh DOUBLE, density DOUBLE, beds INT,
  ambulances INT, police INT, firefighters INT, rescue_teams INT,
  shelter_capacity INT,
  occupancy DOUBLE NOT NULL DEFAULT 0.35,     -- fraction of shelter capacity in use
  risk VARCHAR(10) NOT NULL DEFAULT 'Low',    -- latest predicted risk class
  areas TEXT,                                 -- JSON list of areas inside the district
  gx INT, gy INT,                             -- tile position on the schematic map
  is_sample TINYINT NOT NULL DEFAULT 1        -- 1 = sample / simulated data
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE hospitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  district_id INT NOT NULL, name VARCHAR(100), beds INT,
  FOREIGN KEY (district_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE shelters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  district_id INT NOT NULL, name VARCHAR(100), capacity INT, occupancy INT NOT NULL DEFAULT 0,
  status VARCHAR(15) NOT NULL DEFAULT 'Available', facilities VARCHAR(200),
  CHECK (status IN ('Available','Near Capacity','Full','Emergency')),
  FOREIGN KEY (district_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE responders (                     -- units per type per district station
  id INT AUTO_INCREMENT PRIMARY KEY,
  district_id INT NOT NULL, type VARCHAR(40) NOT NULL, total INT, deployed INT NOT NULL DEFAULT 0,
  UNIQUE (district_id, type),
  FOREIGN KEY (district_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE resources (                      -- availability compared against predicted demand
  id INT AUTO_INCREMENT PRIMARY KEY,
  district_id INT NOT NULL, name VARCHAR(60) NOT NULL, total DOUBLE,
  UNIQUE (district_id, name),
  FOREIGN KEY (district_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  district_id INT NOT NULL, item VARCHAR(20) NOT NULL, stock DOUBLE, base DOUBLE,
  UNIQUE (district_id, item),
  FOREIGN KEY (district_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  district_id INT NOT NULL, area VARCHAR(80), type VARCHAR(40), `date` VARCHAR(20), `time` VARCHAR(10),
  severity INT, affected INT, reported_injured INT,
  water_level DOUBLE, rainfall DOUBLE, temperature DOUBLE, description VARCHAR(500),
  reported_by INT, reported_role VARCHAR(10), created_at VARCHAR(40),
  FOREIGN KEY (district_id) REFERENCES districts(id),
  FOREIGN KEY (reported_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sensor_readings (                -- simulated readings, NOT real hardware
  id INT AUTO_INCREMENT PRIMARY KEY,
  ts VARCHAR(40), water_level DOUBLE, rainfall DOUBLE, temperature DOUBLE, crowd DOUBLE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE historical_incidents (           -- simulated history used to fit the models
  id INT AUTO_INCREMENT PRIMARY KEY,
  district VARCHAR(60), disaster_type VARCHAR(40), severity INT, water_level DOUBLE, rainfall DOUBLE,
  temperature DOUBLE, affected INT, density DOUBLE, prior_incidents INT, risk_class INT, injured INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE predictions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  incident_id INT NOT NULL UNIQUE,
  risk VARCHAR(10), probs TEXT, logits TEXT, score DOUBLE,
  expected_injured INT, count_model VARCHAR(30), mean DOUBLE, variance DOUBLE,
  demand TEXT, need TEXT, responder_need TEXT, alloc TEXT,
  FOREIGN KEY (incident_id) REFERENCES incidents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  incident_id INT, district_id INT,
  level VARCHAR(10), title VARCHAR(100), message VARCHAR(300), created_at VARCHAR(40),
  FOREIGN KEY (incident_id) REFERENCES incidents(id),
  FOREIGN KEY (district_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE routes (                         -- road graph between district HQs (km)
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_id INT NOT NULL, to_id INT NOT NULL, km DOUBLE NOT NULL,
  FOREIGN KEY (from_id) REFERENCES districts(id),
  FOREIGN KEY (to_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE assignments (                    -- responder units sent to an incident
  id INT AUTO_INCREMENT PRIMARY KEY,
  incident_id INT NOT NULL, type VARCHAR(40), station_id INT, target_id INT,
  units INT, path VARCHAR(300), km DOUBLE, minutes DOUBLE,
  status VARCHAR(15) NOT NULL DEFAULT 'Dispatched', updated_by VARCHAR(40), updated_at VARCHAR(40),
  CHECK (status IN ('Dispatched','En route','On scene','Completed')),
  FOREIGN KEY (incident_id) REFERENCES incidents(id),
  FOREIGN KEY (station_id) REFERENCES districts(id),
  FOREIGN KEY (target_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY, ts VARCHAR(40), actor VARCHAR(40), `text` VARCHAR(300)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory_log (
  id INT AUTO_INCREMENT PRIMARY KEY, ts VARCHAR(40),
  district_id INT, item VARCHAR(20), action VARCHAR(30), qty DOUBLE, actor VARCHAR(40),
  FOREIGN KEY (district_id) REFERENCES districts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
