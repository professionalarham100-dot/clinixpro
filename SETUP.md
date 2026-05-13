# Smart Clinical Management System - Quick Setup Guide

## 🚀 5-Minute Setup

### Step 1: Database Setup
```bash
# Open MySQL
mysql -u root -p

# Run these commands
CREATE DATABASE smart_clinic;
USE smart_clinic;
SOURCE database/schema.sql;
SOURCE database/sample_data.sql;
EXIT;
```

### Step 2: Backend Setup (Windows)
```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
copy .env.example .env

# Edit .env with your database credentials
# Then run
python app.py
```

### Step 3: Frontend Setup
Open `frontend/index.html` in your browser or use Python server:
```bash
# In a new terminal
cd frontend
python -m http.server 8000
```

Visit: `http://localhost:8000`

---

## 📝 Demo Credentials

### Patient Account
- **Email:** ahmed.hassan@email.com
- **Password:** password123

### Doctor Account
- **Email:** dr.amir@hospital.com
- **Password:** password123

### Admin Account
- **Email:** admin@hospital.com
- **Password:** admin123

---

## 🔧 Configuration

### Database Connection (.env)
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=smart_clinic
```

### JWT Secret
```
JWT_SECRET_KEY=your-secret-key-change-in-production
```

---

## 📊 Key Features

✅ **Authentication System**
- User registration and login
- JWT token-based security
- Role-based access (Doctor, Patient, Admin)

✅ **Patient Portal**
- Dashboard with statistics
- Book appointments
- View medical records
- Check prescriptions
- Pay bills
- Update profile

✅ **Doctor Portal**
- Appointments calendar
- Patient management
- Create medical records
- Manage prescriptions
- Task tracking
- Performance metrics

✅ **Database**
- 11+ tables for comprehensive data management
- Pre-built views for analytics
- Sample data for testing

---

## 🧪 Testing

### Test Patient Workflow
1. Login as patient
2. Go to "Book Appointment"
3. Select a doctor
4. Choose date and reason
5. Submit

### Test Doctor Workflow
1. Login as doctor
2. View "Today's Appointments"
3. Click "View" to see patient details
4. Create a medical record
5. Check performance metrics

---

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `POST /api/auth/forgot-password` - Reset password

### Patients
- `GET /api/patients` - List all
- `POST /api/patients` - Create
- `GET /api/patients/{id}` - Get details
- `PUT /api/patients/{id}` - Update
- `DELETE /api/patients/{id}` - Delete

### Appointments
- `GET /api/appointments` - List all
- `POST /api/appointments` - Create
- `PUT /api/appointments/{id}` - Update

### Medical Records
- `GET /api/medical-records` - List
- `POST /api/medical-records` - Create

### Billing
- `GET /api/billing` - List bills

---

## 🐛 Troubleshooting

### Issue: Database Connection Failed
**Solution:**
- Check MySQL is running
- Verify credentials in .env
- Ensure database is created

### Issue: Port Already in Use
**Solution:**
```bash
# Windows - Kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:5000 | xargs kill -9
```

### Issue: Module Not Found
**Solution:**
```bash
# Activate virtual environment
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

# Reinstall packages
pip install -r requirements.txt
```

### Issue: CORS Errors
**Solution:**
- Make sure backend is running on `http://localhost:5000`
- Frontend should be on `http://localhost:8000`

---

## 📁 Project Structure

```
project/
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── patient-dashboard.html
│   ├── doctor-dashboard.html
│   ├── css/
│   └── js/
├── backend/
│   ├── app.py (Main Flask app - 600+ lines)
│   ├── config.py
│   ├── requirements.txt
│   └── .env.example
├── database/
│   ├── schema.sql (11 tables + views)
│   └── sample_data.sql
├── README.md
└── API_DOCUMENTATION.md
```

---

## 💡 Next Steps

1. Customize branding (logo, colors, text)
2. Add email notifications
3. Integrate payment gateway
4. Set up deployment (Heroku, AWS, etc.)
5. Configure backup system
6. Set up monitoring and logging

---

## 📞 Support

- Review code comments for details
- Check API_DOCUMENTATION.md for endpoints
- See README.md for full features list
- Database schema in database/schema.sql

---

## ✅ Project Ready!

Your Smart Clinical Management System is now set up and ready to use. 🎉

All features are functional:
- ✅ User authentication
- ✅ Patient portal
- ✅ Doctor portal  
- ✅ Appointment management
- ✅ Medical records
- ✅ Billing system
- ✅ Database with 11 tables
- ✅ REST API endpoints
- ✅ Real-time data updates
