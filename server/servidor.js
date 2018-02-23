// Iniciando el servidor con sus variables

const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
var mongoose = require("mongoose");

const publicPath = path.join(__dirname, '../public');
const port = process.env.PORT || 3000;
var app = express();
var server = http.createServer(app);
var io = socketIO(server);

app.use(express.static(publicPath));

//Variables propias del ServidorSocketService
let usuarios = [];
let confirmados = 0;
let preguntas = [];

//Configurar conexion de mongodb

var uristring = 'mongodb://admin:admin@ds245218.mlab.com:45218/nokahoot' || 'mongodb://localhost/nokahoot';
mongoose.connect(uristring, function(err, res) {
  if (err) {
    console.log('ERROR connecting to: ' + uristring + '. ' + err);
  } else {
    console.log('Succeeded connected to: ' + uristring);
  }
});
var userSchema = new mongoose.Schema({
  id: String,
  pregunta: String,
  correcta: String,
  a: String,
  b: String,
  c: String,
  d: String
});
var tabla = mongoose.model('Preguntas', userSchema);
tabla.find({}).exec(function(err, result) {
  if (!err) {
    preguntas = result.length;
    console.log('Número de preguntas en la base de datos: ' + result.length);
  } else {
    console.log(err);
  };
});

//Detección de eventos
io.on('connection', (socket) => {
  console.log('Se ha iniciado una nueva conexión');
  socket.on('new-usuario', (datos) => {
    console.log('Usuario Identificado: ' + datos.usuario);
    usuarios.push({nombre: datos.usuario, sala: datos.sala, puntuacion: 0});
    socket.join(datos.sala);
    var confirmado = 0;
    var acabado = 0;
    var habitacion = io.sockets.adapter.rooms[datos.sala];
    // console.log('Habitantes de '+ datos.sala + ': '+ habitacion.length);
    console.log(usuarios);
    if (habitacion.length == 2) {
      console.log('Tenemos 2 jugadores disponibles en sala: ' + datos.sala);
      // console.log(usuarios);
      io.to(datos.sala).emit('esperarJuego', true);
    }

    socket.on('mensaje', (msg) => {
      let infoMensaje = [];
      infoMensaje.push({usuario: datos.usuario, mensaje: msg});
      io.to(datos.sala).emit('maquetaMensaje', infoMensaje);
    });

    socket.on('confirmado', function(value) {
      if (value) {
        // console.log(datos.sala);
        confirmado++
        // console.log('Confirmado ' + confirmado);
        acabado = 0;
        if (confirmado >= 2) {
          console.log('Ya se puede jugar en la Sala: ' + datos.sala);
          io.to(datos.sala).emit('jugar', true);
        } else {
          socket.broadcast.to(datos.sala).emit('confirmadoGrupo', true);
        }
      }
    });

    socket.on('confirmadoGrupo', function(value) {
      confirmado++;
    });

    socket.on('pregunta', function(datos) {
      console.log('Pregunta ' + datos);
      if (datos < preguntas) {
        datos++;
        tabla.find({id: datos}).exec(function(err, result) {
          if (!err) {
            console.log('Cargando pregunta: ' + datos);
            socket.emit('nPregunta', result[0]);
          } else {
            console.log(err);
          };
        });
      } else {
        socket.emit('acabado', true);
      }
    });

    socket.on('correcta', (valorRespuesta) => {
      valorRespuesta = parseInt(valorRespuesta);
      console.log('Respuesta Correcta ' + valorRespuesta + ' puntos');
      for (var i = 0; i < usuarios.length; i++) {
        if (usuarios[i].nombre == datos.usuario) {
          usuarios[i].puntuacion += valorRespuesta;
          // console.log('encontrado');
        }
      }
      console.log(usuarios);
    });

    socket.on('incorrecta', (valorRespuesta) => {
      valorRespuesta = parseInt(valorRespuesta);
      console.log('Respuesta Incorrecta ' + valorRespuesta + ' puntos');
      for (var i = 0; i < usuarios.length; i++) {
        if (usuarios[i].nombre == datos.usuario) {
          usuarios[i].puntuacion += valorRespuesta;
          // console.log('encontrado');
        }
      }
      console.log(usuarios);
    });

    socket.on('acabado', function(value) {
      if (value) {
        // console.log(datos.sala);
        acabado++
        // console.log('Confirmado ' + confirmado);
        if (acabado >= 2) {
          console.log('Ya se puede mostrar la puntuación en la Sala: ' + datos.sala);
          io.to(datos.sala).emit('puntuacion', true);
        } else {
          socket.broadcast.to(datos.sala).emit('acabadoGrupo', true);
        }
      }
    });

    socket.on('acabadoGrupo', function(value) {
      acabado++;
    });

    socket.on('renderizarPuntuacion', function(value) {
      if (value) {
        let nombreGanador;
        let puntuacionGanador = -9999;
        let nombrePerdedor;
        let puntuacionPerdedor;
        let jsonPuntuacion = [];
        for (var i = 0; i < usuarios.length; i++) {
          if (usuarios[i].sala == datos.sala) {
            if (usuarios[i].puntuacion > puntuacionGanador) {
              nombrePerdedor = nombreGanador;
              puntuacionPerdedor = puntuacionGanador;
              nombreGanador = usuarios[i].nombre;
              puntuacionGanador = usuarios[i].puntuacion;
            } else {
              nombrePerdedor = usuarios[i].nombre;
              puntuacionPerdedor = usuarios[i].puntuacion;
            }
          }
        }
        jsonPuntuacion.push({nGanador: nombreGanador, pGanador: puntuacionGanador, nPerdedor: nombrePerdedor, pPerdedor: puntuacionPerdedor});
        io.to(datos.sala).emit('ganador', jsonPuntuacion);
      }
    });

    socket.on('salir', function(value) {
      console.log('Se ha desconectado: ' + datos.usuario);
      socket.leave(datos.sala);
      for (var i = 0; i < usuarios.length; i++) {
        if (usuarios[i].nombre == datos.usuario) {
          usuarios.splice(i, 1);
        }
      }
      confirmado = 0;
      acabado = 0;
    });

    //Detección de usuario desconectado
    socket.on('disconnect', () => {
      console.log('Se ha desconectado: ' + datos.usuario);
      socket.leave(datos.sala);
      for (var i = 0; i < usuarios.length; i++) {
        if (usuarios[i].nombre == datos.usuario) {
          usuarios.splice(i, 1);
        }
      }
      confirmado = 0;
      acabado = 0;
      if (habitacion.length == 1) {
        console.log('Esperando más jugadores');
        io.to(datos.sala).emit('esperarJuego', false);
      }
      // console.log(usuarios);
    });
  });
});

// server.listen(port, () => {
//   console.log(`Iniciado en puerto: ${port}`);
// });

server.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
